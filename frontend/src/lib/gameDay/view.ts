// Read models for the check-in page, the profile list and Game Planner (ATTENDANCE_VOTE_PLAN.md,
// "API routes" / "UI"). Everything here is derived from the same loadGameDayState +
// computeGameDayCounts + evaluateVote the write paths use, so the page can never offer an
// action the server would refuse.
import type { GameDay, GameDayStatus, OpenSlotClaimSource, OpenSlotEntryStatus, Player, VoteChoice } from '@prisma/client';
import prisma from '@/lib/prisma';
import { dateOnlyFromIso, isoFromDateOnly } from './clock';
import { computeGameDayCounts } from './counts';
import { loadGameDayState, type GameDayState } from './eligibility';
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
  };
}

const byRankThenName = (a: RosterPlayer, b: RosterPlayer) =>
  (a.playerRank ?? Number.MAX_SAFE_INTEGER) - (b.playerRank ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);

function buildRoster(state: GameDayState) {
  const counts = computeGameDayCounts(state);
  const inPlayers: RosterPlayer[] = [];
  const outPlayers: RosterPlayer[] = [];
  for (const vote of state.votes) {
    const player = state.players.get(vote.playerId);
    if (!player || !state.voterIds.has(vote.playerId) || vote.inheritedFromPlayerId !== null) continue;
    if (vote.choice === 'IN') inPlayers.push(rosterPlayer(player, state));
    else if (vote.choice === 'OUT') outPlayers.push(rosterPlayer(player, state));
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
  return {
    counts,
    inPlayers: inPlayers.sort(byRankThenName),
    outPlayers: outPlayers.sort(byRankThenName),
    unconfirmed: unconfirmed.sort(byRankThenName),
    waiting,
  };
}

export type GameDayRole = 'VOTER' | 'OPEN_SLOT' | 'OBSERVER';

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
  counts: { confirmedIn: number; slotsHeld: number; vacancies: number | null };
}

const no = (reason: string): VoteVerdict => ({ ok: false, reason });
const yes: VoteVerdict = { ok: true };

function openSlotActions(state: GameDayState, playerId: number, now: Date, vacancies: number | null) {
  const { gameDay } = state;
  const entry = state.openSlots.find((s) => s.playerId === playerId);
  const inPool = state.openSlotPoolIds.has(playerId);
  const pastLock = now.getTime() >= gameDay.slotLockAt.getTime();
  const blocked =
    gameDay.status === 'CANCELLED'
      ? 'This game day has been cancelled'
      : !inPool
        ? 'Only open-slot players can join the waiting list'
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

export async function getGameDayView(gameDay: GameDay, player: Player | null, now: Date = new Date()): Promise<GameDayView> {
  const state = await loadGameDayState(prisma, gameDay);
  const { counts, inPlayers, outPlayers, unconfirmed, waiting } = buildRoster(state);
  const playerId = player?.id ?? null;
  const holding: Holding = playerId === null ? 'NONE' : holdingOf(state, playerId);
  const role: GameDayRole = holding === 'STRUCTURAL' || holding === 'ASSIGNED' ? 'VOTER' : holding === 'OPEN_SLOT_POOL' ? 'OPEN_SLOT' : 'OBSERVER';

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
    },
    rosterVisible,
    roster: rosterVisible
      ? { in: inPlayers, out: outPlayers, awaitingConfirmation: unconfirmed, waitingCount: waiting.length }
      : null,
    counts: { confirmedIn: counts.confirmedIn, slotsHeld: counts.slotsHeld, vacancies: counts.vacancies },
  };
}

export interface UpcomingGameDay extends GameDaySummary {
  isToday: boolean;
  role: GameDayRole;
  myVote: VoteChoice | null;
  myReservation: boolean;
  myOpenSlotStatus: OpenSlotEntryStatus | null;
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
      return {
        ...summaryOf(gameDay),
        isToday: isToday(clockOf(gameDay), now),
        role: (holding === 'STRUCTURAL' || holding === 'ASSIGNED' ? 'VOTER' : holding === 'OPEN_SLOT_POOL' ? 'OPEN_SLOT' : 'OBSERVER') as GameDayRole,
        myVote: vote && vote.inheritedFromPlayerId === null ? vote.choice : null,
        myReservation: vote !== null && vote.inheritedFromPlayerId !== null,
        myOpenSlotStatus: player ? state.openSlots.find((s) => s.playerId === player.id)?.status ?? null : null,
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
    confirmed: inPlayers,
    unconfirmed,
    outAfterDeadline,
    waitingList: waiting.map((s) => rosterPlayer(state.players.get(s.playerId)!, state)),
  };
}
