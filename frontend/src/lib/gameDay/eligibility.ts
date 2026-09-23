// Who holds a slot on a game date, and who is queueing for one (ATTENDANCE_VOTE_PLAN.md,
// Decision 5 and "Eligibility"). Eligibility is a property of THE SLOT, resolved against the
// GAME DATE - never today. A vote opens days ahead, so a replacement window that starts tomorrow
// already makes its owner ineligible for a vote that opened yesterday; neither
// getAvailablePlayersForGame (hardcodes today) nor filterBoardVisible (answers a different
// question) can be reused here for exactly that reason.
//
//   structural holders = FULLTIME \ {replacement owners}  ∪  OPEN_SLOT ∩ {replacement fillers}
//   open-slot pool     = OPEN_SLOT \ {replacement fillers}
//   voters             = structural holders ∪ {players with an ASSIGNED open slot that day}
//
// all excluding DISABLED. The first two are disjoint by construction; that is what makes
// slotsHeld a sum rather than a union (counts.ts), and what lets one page serve both roles.
//
// A one-day slot nomination (SINGLE_DAY_NOMINATION_PLAN.md) changes none of the structural side:
// the nominator keeps the slot and the vote. It only takes the nominee out of THIS game day's
// open-slot pool (loadGameDayState), so they cannot also queue for - and be promoted into - a
// second slot.
import type { GameDay, GameDayOpenSlot, GameDaySlotNomination, GameDayVote, Player, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

// Any Prisma client - the root one or an interactive transaction's. Every read here must be
// able to run inside the caller's locked transaction so it sees the caller's own writes.
export type Db = Prisma.TransactionClient;

type SlotPlayer = Pick<Player, 'id' | 'playerType' | 'playerStatus'>;
type ActiveReplacement = { fulltimePlayerId: number; replacementPlayerId: number };

// Pure core, so the set arithmetic is testable without a database.
export function classifySlotHolders<P extends SlotPlayer>(
  players: P[],
  activeReplacements: ActiveReplacement[]
): { structuralHolders: P[]; openSlotPool: P[] } {
  const owners = new Set(activeReplacements.map((r) => r.fulltimePlayerId));
  const fillers = new Set(activeReplacements.map((r) => r.replacementPlayerId));
  const eligible = players.filter((p) => p.playerStatus !== 'DISABLED');
  return {
    structuralHolders: eligible.filter(
      (p) =>
        (p.playerType === 'FULLTIME' && !owners.has(p.id)) || (p.playerType === 'OPEN_SLOT' && fillers.has(p.id))
    ),
    openSlotPool: eligible.filter((p) => p.playerType === 'OPEN_SLOT' && !fillers.has(p.id)),
  };
}

// "Active on date D" = startDate <= D <= endDate AND cancelledAt IS NULL, the derived-not-stored
// convention OPEN_SLOT_PLAYERS_PLAN.md established.
async function activeReplacementsOn(db: Db, squadId: number, gameDate: Date): Promise<ActiveReplacement[]> {
  return db.slotReplacement.findMany({
    where: { squadId, cancelledAt: null, startDate: { lte: gameDate }, endDate: { gte: gameDate } },
    select: { fulltimePlayerId: true, replacementPlayerId: true },
  });
}

async function classify(db: Db, squadId: number, gameDate: Date) {
  const [players, replacements] = await Promise.all([
    db.player.findMany({ where: { squadId } }),
    activeReplacementsOn(db, squadId, gameDate),
  ]);
  return { players, ...classifySlotHolders(players, replacements) };
}

export async function getStructuralSlotHolders(squadId: number, gameDate: Date, db: Db = prisma): Promise<Player[]> {
  return (await classify(db, squadId, gameDate)).structuralHolders;
}

export async function getOpenSlotPool(squadId: number, gameDate: Date, db: Db = prisma): Promise<Player[]> {
  return (await classify(db, squadId, gameDate)).openSlotPool;
}

// Who may cast a vote on THIS game day. Not merely a read the UI uses: it is the invariant the
// reconciliation writes maintain (reconcile.ts), and every count in counts.ts assumes it holds.
export async function getGameDayVoters(gameDay: GameDay, db: Db = prisma): Promise<Player[]> {
  const state = await loadGameDayState(db, gameDay);
  return Array.from(state.voterIds).map((id) => state.players.get(id)!);
}

// Everything the vote rules, the vacancy sync and the page view need about one game day, read
// in one place so they cannot disagree about who holds what.
export interface GameDayState {
  gameDay: GameDay;
  players: Map<number, Player>;
  structuralHolderIds: Set<number>;
  // This game day's pool: the date's open-slot pool minus the day's active nominees.
  openSlotPoolIds: Set<number>;
  // Pool players holding an ASSIGNED open slot today - voters alongside structural holders.
  assignedIds: Set<number>;
  voterIds: Set<number>;
  votes: GameDayVote[];
  openSlots: GameDayOpenSlot[];
  // Every nomination row of the game day, ended ones included (the history), and the active
  // ones keyed both ways. At most one active per nominator and per nominee - enforced under the
  // game day's lock (nominations.ts).
  nominations: GameDaySlotNomination[];
  activeNominationByNominator: Map<number, GameDaySlotNomination>;
  activeNominationByNominee: Map<number, GameDaySlotNomination>;
}

export async function loadGameDayState(db: Db, gameDay: GameDay): Promise<GameDayState> {
  const [{ players, structuralHolders, openSlotPool }, votes, openSlots, nominations] = await Promise.all([
    classify(db, gameDay.squadId, gameDay.gameDate),
    db.gameDayVote.findMany({ where: { gameDayId: gameDay.id } }),
    db.gameDayOpenSlot.findMany({ where: { gameDayId: gameDay.id } }),
    db.gameDaySlotNomination.findMany({ where: { gameDayId: gameDay.id }, orderBy: { id: 'asc' } }),
  ]);
  const active = nominations.filter((n) => n.endedAt === null);
  const activeNominationByNominee = new Map(active.map((n) => [n.nomineePlayerId, n]));
  const structuralHolderIds = new Set(structuralHolders.map((p) => p.id));
  const openSlotPoolIds = new Set(
    openSlotPool.map((p) => p.id).filter((id) => !activeNominationByNominee.has(id))
  );
  // Only a pool member's ASSIGNED row makes them a voter: a DISABLED player's leftover row, or
  // one whose player has since become a structural holder, grants nothing.
  const assignedIds = new Set(
    openSlots.filter((s) => s.status === 'ASSIGNED' && openSlotPoolIds.has(s.playerId)).map((s) => s.playerId)
  );
  return {
    gameDay,
    players: new Map(players.map((p) => [p.id, p])),
    structuralHolderIds,
    openSlotPoolIds,
    assignedIds,
    voterIds: new Set([...Array.from(structuralHolderIds), ...Array.from(assignedIds)]),
    votes,
    openSlots,
    nominations,
    activeNominationByNominator: new Map(active.map((n) => [n.nominatorPlayerId, n])),
    activeNominationByNominee,
  };
}
