// Read models for the check-in page, the profile list and Game Planner (ATTENDANCE_VOTE_PLAN.md,
// "API routes" / "UI"). Everything here is derived from the same loadGameDayState +
// computeGameDayCounts + evaluateVote the write paths use, so the page can never offer an
// action the server would refuse.
import type {
  GameDay,
  GameDaySlotNomination,
  GameDayStatus,
  OpenSlotClaimSource,
  OpenSlotEntryStatus,
  Player,
  SlotNominationEndReason,
  VoteChoice,
} from '@prisma/client';
import prisma from '@/lib/prisma';
import { dateOnlyFromIso, isoFromDateOnly } from './clock';
import { computeGameDayCounts } from './counts';
import { loadGameDayState, type GameDayState } from './eligibility';
import { nominationVerdict, nominatorNameFor, nomineeRefusal } from './nominations';
import { clockOf } from './scheduler';
import { evaluateVote, holdingOf, voteContextFor, type Holding, type VoteVerdict } from './votes';
import { isToday, sessionPhase } from './voteWindow';

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

// `[date]` is YYYY-MM-DD and a real calendar date; anything else is a 400 before the database is
// touched.
export function parseGameDateParam(raw: unknown): string | null {
  if (typeof raw !== 'string' || !DATE_PARAM.test(raw)) return null;
  const parsed = dateOnlyFromIso(raw);
  if (Number.isNaN(parsed.getTime()) || isoFromDateOnly(parsed) !== raw) return null;
  return raw;
}

export async function findGameDay(squadId: number, gameDate: string): Promise<GameDay | null> {
  return prisma.gameDay.findUnique({ where: { squadId_gameDate: { squadId, gameDate: dateOnlyFromIso(gameDate) } } });
}

export interface RosterPlayer {
  id: number;
  name: string;
  colorHex: string;
  playerRank: number | null;
  isOpenSlot: boolean;
  hasScore: boolean;
  // Set when this player is in the roster through a one-day nomination: playing in that
  // fulltime player's slot, who is then not listed themselves (SINGLE_DAY_NOMINATION_PLAN.md).
  standingInFor: { id: number; name: string } | null;
}

export interface UnconfirmedPlayer extends RosterPlayer {
  // Why they hold a slot without having confirmed (Decision 6): an assigned open slot, or a
  // reservation inherited with a slot transferred after the deadline.
  reason: 'ASSIGNED' | 'INHERITED';
  source: OpenSlotClaimSource | null;
}

function rosterPlayer(player: Player, state: GameDayState): RosterPlayer {
  return {
    id: player.id,
    name: player.name,
    colorHex: player.colorHex,
    playerRank: player.playerRank !== null && player.playerRank > 0 ? player.playerRank : null,
    isOpenSlot: state.assignedIds.has(player.id),
    hasScore: player.rankScore !== null,
    standingInFor: null,
  };
}

// Whose slot a nominee plays in, keyed by nominator: the active nomination, or the one that ran
// its course (SESSION_ENDED) - so a past game day's roster still shows who actually played.
// Never one ended any other way: those all mean the nominee is not coming.
function standInsByNominator(state: GameDayState): Map<number, GameDaySlotNomination> {
  const standIns = new Map<number, GameDaySlotNomination>();
  for (const nomination of state.nominations) {
    if (nomination.endedAt === null || nomination.endReason === 'SESSION_ENDED') {
      standIns.set(nomination.nominatorPlayerId, nomination);
    }
  }
  return standIns;
}

const byRankThenName = (a: RosterPlayer, b: RosterPlayer) =>
  (a.playerRank ?? Number.MAX_SAFE_INTEGER) - (b.playerRank ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);

// The ONE place a nominee replaces their nominator as "attending". Game Planner pre-ticks
// getGameDayAttendance().confirmed, which is this function's inPlayers - so a swap made anywhere
// else would still have the planner tick, and the Elo run score, the nominator.
function buildRoster(state: GameDayState) {
  const counts = computeGameDayCounts(state);
  const standIns = standInsByNominator(state);
  const inPlayers: RosterPlayer[] = [];
  const outPlayers: RosterPlayer[] = [];
  // Latest vote first. votedAt is re-stamped on every vote, so switching sides moves you to the top.
  const latestFirst = [...state.votes].sort((a, b) => b.votedAt.getTime() - a.votedAt.getTime() || b.id - a.id);
  for (const vote of latestFirst) {
    const player = state.players.get(vote.playerId);
    if (!player || !state.voterIds.has(vote.playerId) || vote.inheritedFromPlayerId !== null) continue;
    if (vote.choice === 'IN') {
      const standIn = standIns.get(player.id);
      const nominee = standIn ? state.players.get(standIn.nomineePlayerId) : undefined;
      inPlayers.push(
        nominee
          ? { ...rosterPlayer(nominee, state), standingInFor: { id: player.id, name: player.name } }
          : rosterPlayer(player, state)
      );
    } else if (vote.choice === 'OUT') outPlayers.push(rosterPlayer(player, state));
  }
  const unconfirmed: UnconfirmedPlayer[] = [
    ...counts.unconfirmedAssigneeIds.map((id) => ({
      ...rosterPlayer(state.players.get(id)!, state),
      reason: 'ASSIGNED' as const,
      source: state.openSlots.find((s) => s.playerId === id)?.source ?? null,
    })),
    ...counts.inheritedReservationIds.map((id) => ({
      ...rosterPlayer(state.players.get(id)!, state),
      reason: 'INHERITED' as const,
      source: null,
    })),
  ];
  const waiting = state.openSlots
    .filter((s) => s.status === 'WAITING' && state.openSlotPoolIds.has(s.playerId))
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.id - b.id);
  // Fulltime slot holders with no vote row at all. An inherited reservation is a vote row and is
  // already listed under awaiting confirmation, as are assigned open-slot players yet to vote.
  const votedIds = new Set(state.votes.map((v) => v.playerId));
  const notVoted = Array.from(state.structuralHolderIds)
    .filter((id) => !votedIds.has(id))
    .map((id) => rosterPlayer(state.players.get(id)!, state));
  return {
    counts,
    inPlayers,
    outPlayers,
    unconfirmed: unconfirmed.sort(byRankThenName),
    waiting,
    notVoted: notVoted.sort(byRankThenName),
  };
}

// NOMINEE: playing in someone else's slot through a one-day nomination - no vote and no
// waiting-list actions, just the arrangement (SINGLE_DAY_NOMINATION_PLAN.md, "UI").
export type GameDayRole = 'VOTER' | 'NOMINEE' | 'OPEN_SLOT' | 'OBSERVER';

function roleOf(holding: Holding): GameDayRole {
  if (holding === 'STRUCTURAL' || holding === 'ASSIGNED') return 'VOTER';
  if (holding === 'NOMINEE') return 'NOMINEE';
  if (holding === 'OPEN_SLOT_POOL') return 'OPEN_SLOT';
  return 'OBSERVER';
}

export interface GameDaySummary {
  gameDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: GameDayStatus;
  votesCloseAt: string;
  slotLockAt: string;
  minPlayers: number | null;
}

function summaryOf(gameDay: GameDay): GameDaySummary {
  return {
    ...clockOf(gameDay),
    status: gameDay.status,
    votesCloseAt: gameDay.votesCloseAt.toISOString(),
    slotLockAt: gameDay.slotLockAt.toISOString(),
    minPlayers: gameDay.minPlayers,
  };
}

export interface GameDayView extends GameDaySummary {
  role: GameDayRole;
  holding: Holding;
  observerReason: string | null;
  myPlayerId: number | null;
  // Your own answer. Null while you have not spoken - including while you sit on an inherited
  // reservation, which is not your vote (myReservation says so).
  myVote: VoteChoice | null;
  myReservation: boolean;
  myOpenSlot: { status: OpenSlotEntryStatus; source: OpenSlotClaimSource | null; waitingPosition: number | null } | null;
  actions: {
    voteIn: VoteVerdict;
    voteOut: VoteVerdict;
    joinWaitingList: VoteVerdict;
    leaveWaitingList: VoteVerdict;
    claimSlot: VoteVerdict;
    // Create, switch or revoke a one-day nomination - one verdict, since all three share the
    // same window and the same "fulltime, own slot" rule.
    nominate: VoteVerdict;
  };
  // Your side of a one-day nomination, if any. `mine`: you passed your slot on (the nominator).
  // `standingInFor`: you are playing in someone else's slot (the nominee).
  nomination: {
    mine: { nomineeId: number; nomineeName: string } | null;
    standingInFor: { id: number; name: string } | null;
  };
  // "Roster hidden until you vote" applies to voters only (resolved open question 3): anyone who
  // cannot vote sees it straight away, since there is nothing to withhold it against. Withheld
  // server-side too, not just by the page.
  rosterVisible: boolean;
  roster: {
    in: RosterPlayer[];
    out: RosterPlayer[];
    awaitingConfirmation: UnconfirmedPlayer[];
    waitingCount: number;
  } | null;
  // Who is on the open-slot waiting list, in join order (first in line first). Squad admins and
  // super admins only, and always - not withheld with the roster, which only hides the In/Out
  // votes. Everyone else gets null and just sees roster.waitingCount.
  waitingList: RosterPlayer[] | null;
  // Fulltime slot holders who have not voted yet, in rank order. Admins only and always, like
  // waitingList; null for everyone else.
  notVoted: RosterPlayer[] | null;
  counts: { confirmedIn: number; slotsHeld: number; vacancies: number | null };
}

const no = (reason: string): VoteVerdict => ({ ok: false, reason });
const yes: VoteVerdict = { ok: true };

function openSlotActions(state: GameDayState, playerId: number, now: Date, vacancies: number | null) {
  const { gameDay } = state;
  const entry = state.openSlots.find((s) => s.playerId === playerId);
  const inPool = state.openSlotPoolIds.has(playerId);
  const pastLock = now.getTime() >= gameDay.slotLockAt.getTime();
  const nominatorName = nominatorNameFor(state, playerId);
  const blocked =
    gameDay.status === 'CANCELLED'
      ? 'This game day has been cancelled'
      : !inPool
        ? nominatorName !== null
          ? nomineeRefusal(nominatorName)
          : 'Only open-slot players can join the waiting list'
        : gameDay.minPlayers === null
          ? 'This game day has no open slots'
          : pastLock
            ? 'Too late - open slots lock 2 hours before the session starts'
            : entry?.status === 'WITHDRAWN'
              ? 'You gave your slot for this game day back, so you cannot rejoin'
              : null;
  return {
    joinWaitingList:
      blocked !== null ? no(blocked) : gameDay.status !== 'VOTING_OPEN' ? no('Voting has closed') : entry ? no('You are already on the waiting list') : yes,
    leaveWaitingList: entry?.status === 'WAITING' ? yes : no('You are not on the waiting list'),
    claimSlot:
      blocked !== null
        ? no(blocked)
        : gameDay.status !== 'VOTING_CLOSED'
          ? no('Slots are handed out when voting closes')
          : entry?.status === 'ASSIGNED'
            ? no('You already hold a slot')
            : (vacancies ?? 0) <= 0
              ? no('No open slots available')
              : yes,
  };
}

async function observerReasonFor(state: GameDayState, player: Player | null): Promise<string | null> {
  if (!player) {
    return 'You are viewing as an admin without a player profile in this squad, so there is nothing for you to vote on.';
  }
  if (player.playerStatus === 'DISABLED') return 'Your player profile in this squad is disabled.';
  if (player.playerType === 'FULLTIME') {
    const covering = await prisma.slotReplacement.findFirst({
      where: {
        squadId: player.squadId,
        fulltimePlayerId: player.id,
        cancelledAt: null,
        startDate: { lte: state.gameDay.gameDate },
        endDate: { gte: state.gameDay.gameDate },
      },
      include: { replacementPlayer: { select: { name: true } } },
    });
    if (covering) return `You have handed your slot to ${covering.replacementPlayer.name} for this date.`;
  }
  return 'You do not hold a slot on this game day.';
}

export async function getGameDayView(
  gameDay: GameDay,
  player: Player | null,
  now: Date = new Date(),
  { isAdmin = false }: { isAdmin?: boolean } = {}
): Promise<GameDayView> {
  const state = await loadGameDayState(prisma, gameDay);
  const { counts, inPlayers, outPlayers, unconfirmed, waiting, notVoted } = buildRoster(state);
  const playerId = player?.id ?? null;
  const holding: Holding = playerId === null ? 'NONE' : holdingOf(state, playerId);
  const role = roleOf(holding);
  const myNomination = playerId === null ? undefined : state.activeNominationByNominator.get(playerId);
  const receivedNomination = playerId === null ? undefined : state.activeNominationByNominee.get(playerId);

  const vote = playerId === null ? null : state.votes.find((v) => v.playerId === playerId) ?? null;
  const ownVote = vote && vote.inheritedFromPlayerId === null ? vote.choice : null;
  const entry = playerId === null ? undefined : state.openSlots.find((s) => s.playerId === playerId);
  const waitingIndex = entry ? waiting.findIndex((s) => s.id === entry.id) : -1;

  const voteCtx = playerId === null ? null : voteContextFor(state, playerId, now);
  const notAVoter = no('You do not hold a slot on this game day');
  const rosterVisible = role !== 'VOTER' || ownVote !== null;

  return {
    ...summaryOf(gameDay),
    role,
    holding,
    observerReason: role === 'OBSERVER' ? await observerReasonFor(state, player) : null,
    myPlayerId: playerId,
    myVote: ownVote,
    myReservation: vote !== null && vote.inheritedFromPlayerId !== null,
    myOpenSlot: entry
      ? { status: entry.status, source: entry.source, waitingPosition: waitingIndex >= 0 ? waitingIndex + 1 : null }
      : null,
    actions: {
      voteIn: voteCtx ? evaluateVote(voteCtx, 'IN') : notAVoter,
      voteOut: voteCtx ? evaluateVote(voteCtx, 'OUT') : notAVoter,
      ...(playerId === null
        ? { joinWaitingList: notAVoter, leaveWaitingList: notAVoter, claimSlot: notAVoter }
        : openSlotActions(state, playerId, now, counts.vacancies)),
      nominate: playerId === null ? notAVoter : nominationVerdict(state, playerId, now),
    },
    nomination: {
      mine: myNomination
        ? {
            nomineeId: myNomination.nomineePlayerId,
            nomineeName: state.players.get(myNomination.nomineePlayerId)?.name ?? 'someone',
          }
        : null,
      standingInFor: receivedNomination
        ? {
            id: receivedNomination.nominatorPlayerId,
            name: state.players.get(receivedNomination.nominatorPlayerId)?.name ?? 'someone',
          }
        : null,
    },
    rosterVisible,
    roster: rosterVisible
      ? { in: inPlayers, out: outPlayers, awaitingConfirmation: unconfirmed, waitingCount: waiting.length }
      : null,
    waitingList: isAdmin ? waiting.map((s) => rosterPlayer(state.players.get(s.playerId)!, state)) : null,
    notVoted: isAdmin ? notVoted : null,
    counts: { confirmedIn: counts.confirmedIn, slotsHeld: counts.slotsHeld, vacancies: counts.vacancies },
  };
}

export interface UpcomingGameDay extends GameDaySummary {
  isToday: boolean;
  role: GameDayRole;
  myVote: VoteChoice | null;
  myReservation: boolean;
  myOpenSlotStatus: OpenSlotEntryStatus | null;
  // One-day nominations: whose slot you are playing in, or who you passed yours to.
  standingInForName: string | null;
  myNomineeName: string | null;
}

// "Upcoming" means the session has not ended - NOT that voting is open. Filtering on
// VOTING_OPEN would make the profile list and the Check-in tab vanish at 13:00 on the very day
// people need them (assignees still have to confirm, holders can still drop out).
export async function listUpcomingGameDays(squadId: number, player: Player | null, now: Date = new Date()): Promise<UpcomingGameDay[]> {
  const rows = await prisma.gameDay.findMany({
    where: { squadId, status: { not: 'CANCELLED' } },
    orderBy: { gameDate: 'asc' },
  });
  const upcoming = rows.filter((gd) => sessionPhase(clockOf(gd), now) !== 'ended');
  return Promise.all(
    upcoming.map(async (gameDay) => {
      const state = await loadGameDayState(prisma, gameDay);
      const holding = player ? holdingOf(state, player.id) : 'NONE';
      const vote = player ? state.votes.find((v) => v.playerId === player.id) ?? null : null;
      const mine = player ? state.activeNominationByNominator.get(player.id) : undefined;
      return {
        ...summaryOf(gameDay),
        isToday: isToday(clockOf(gameDay), now),
        role: roleOf(holding),
        myVote: vote && vote.inheritedFromPlayerId === null ? vote.choice : null,
        myReservation: vote !== null && vote.inheritedFromPlayerId !== null,
        myOpenSlotStatus: player ? state.openSlots.find((s) => s.playerId === player.id)?.status ?? null : null,
        standingInForName: player ? nominatorNameFor(state, player.id) : null,
        myNomineeName: mine ? state.players.get(mine.nomineePlayerId)?.name ?? null : null,
      };
    })
  );
}

export interface GameDayAttendance extends GameDaySummary {
  gameDayId: number;
  gameId: string | null;
  votingClosedAt: string | null;
  counts: { confirmedIn: number; slotsHeld: number; vacancies: number | null };
  // What Game Planner pre-ticks: confirmedIn players only.
  confirmed: RosterPlayer[];
  // The banner: everyone holding a slot without having confirmed (assignees AND inherited
  // reservations - naming only the assignees would leave a transferred holder neither pre-ticked
  // nor mentioned), and everyone who went OUT after the deadline.
  unconfirmed: UnconfirmedPlayer[];
  outAfterDeadline: RosterPlayer[];
  waitingList: RosterPlayer[];
  // The day's one-day nominations, ended ones included with their reason - the "tracked
  // separately" record, and the answer to "why was Bob playing?".
  nominations: {
    id: number;
    nominatorName: string;
    nomineeName: string;
    createdAt: string;
    endedAt: string | null;
    endReason: SlotNominationEndReason | null;
  }[];
}

// The admin view Game Planner reads.
export async function getGameDayAttendance(gameDay: GameDay): Promise<GameDayAttendance> {
  const [state, game] = await Promise.all([
    loadGameDayState(prisma, gameDay),
    prisma.game.findUnique({ where: { gameDayId: gameDay.id }, select: { id: true } }),
  ]);
  const { counts, inPlayers, unconfirmed, waiting } = buildRoster(state);
  const closedAt = gameDay.votingClosedAt?.getTime() ?? null;
  const outAfterDeadline =
    closedAt === null
      ? []
      : state.votes
          .filter((v) => v.choice === 'OUT' && v.inheritedFromPlayerId === null && v.updatedAt.getTime() > closedAt)
          .map((v) => state.players.get(v.playerId))
          .filter((p): p is Player => p !== undefined)
          .map((p) => rosterPlayer(p, state));
  return {
    ...summaryOf(gameDay),
    gameDayId: gameDay.id,
    gameId: game?.id ?? null,
    votingClosedAt: gameDay.votingClosedAt?.toISOString() ?? null,
    counts: { confirmedIn: counts.confirmedIn, slotsHeld: counts.slotsHeld, vacancies: counts.vacancies },
    // Rank order, not vote order: Game Planner caps its pre-tick, and who gets cut should not
    // depend on who voted last.
    confirmed: [...inPlayers].sort(byRankThenName),
    unconfirmed,
    outAfterDeadline,
    waitingList: waiting.map((s) => rosterPlayer(state.players.get(s.playerId)!, state)),
    nominations: state.nominations.map((n) => ({
      id: n.id,
      nominatorName: state.players.get(n.nominatorPlayerId)?.name ?? `#${n.nominatorPlayerId}`,
      nomineeName: state.players.get(n.nomineePlayerId)?.name ?? `#${n.nomineePlayerId}`,
      createdAt: n.createdAt.toISOString(),
      endedAt: n.endedAt?.toISOString() ?? null,
      endReason: n.endReason,
    })),
  };
}
