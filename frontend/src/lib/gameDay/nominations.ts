// One-day slot nominations (SINGLE_DAY_NOMINATION_PLAN.md). A fulltime player who holds their own
// slot on a game day passes it to one open-slot player for that day, arranged between the two of
// them beforehand. The nominator KEEPS the slot and its vote - nominating sets that vote to IN -
// and the nominee has no vote at all: if they can't come, they tell the nominator, who votes OUT.
// So slotsHeld and confirmedIn never change; only who is shown as attending does (view.ts's
// buildRoster swaps the nominee in).
//
// Lifecycle: created, switched or revoked by the nominator until votesCloseAt (the instant, not
// the status - Decision 4); frozen after that until the session ends, when it ends SESSION_ENDED.
// Every other way it ends is in endNominationsInvolving / endAllNominations' callers.
import type { GameDay, GameDaySlotNomination, Player, SlotNominationEndReason } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ValidationError } from '@/lib/api/validationError';
import { isoFromDateOnly } from './clock';
import { loadGameDayState, type Db, type GameDayState } from './eligibility';
import { withGameDayLock } from './lock';
import { formatGameDate } from './notifications';
import { syncNominationPosts } from './nominationPosts';
import { sessionPhase, type GameDayClock } from './voteWindow';

type Verdict = { ok: true } | { ok: false; reason: string };

function clockOfRow(gameDay: Pick<GameDay, 'gameDate' | 'startTime' | 'endTime' | 'timezone'>): GameDayClock {
  return {
    gameDate: isoFromDateOnly(gameDay.gameDate),
    startTime: gameDay.startTime,
    endTime: gameDay.endTime,
    timezone: gameDay.timezone,
  };
}

export function isSessionOver(gameDay: Pick<GameDay, 'gameDate' | 'startTime' | 'endTime' | 'timezone'>, now: Date): boolean {
  return sessionPhase(clockOfRow(gameDay), now) === 'ended';
}

// The one answer a nominee gets to anything they try to do about the slot themselves - vote, join
// the waiting list: the hand-off was arranged with the nominator, so backing out goes through
// them (Decision 2).
export function nomineeRefusal(nominatorName: string): string {
  return `${nominatorName} holds the vote for this slot - tell ${nominatorName} if you can't make it`;
}

// Who a nominee is standing in for, by name.
export function nominatorNameFor(state: GameDayState, nomineeId: number): string | null {
  const nomination = state.activeNominationByNominee.get(nomineeId);
  return nomination ? state.players.get(nomination.nominatorPlayerId)?.name ?? null : null;
}

// Whether `playerId` may create, switch or revoke a nomination on this game day right now. The
// time check is against votesCloseAt itself: the status only flips on the next scheduler tick, up
// to five minutes after 13:00, and "before 13:00" is the rule people were told.
export function nominationVerdict(state: GameDayState, playerId: number, now: Date): Verdict {
  const { gameDay } = state;
  if (gameDay.status === 'CANCELLED') return { ok: false, reason: 'This game day has been cancelled' };
  if (gameDay.status !== 'VOTING_OPEN' || now.getTime() >= gameDay.votesCloseAt.getTime()) {
    return { ok: false, reason: 'Voting has closed - a slot can only be passed on before then' };
  }
  const player = state.players.get(playerId);
  // Structural AND fulltime: a fulltime player whose slot is covered by a period replacement is
  // not structural, and a replacement filler is structural but not fulltime - their slot is
  // borrowed, and passing it on would chain hand-offs nobody agreed to (Decision 3).
  if (!player || player.playerType !== 'FULLTIME' || !state.structuralHolderIds.has(playerId)) {
    return { ok: false, reason: 'Only a fulltime player holding their own slot on this game day can pass it on' };
  }
  return { ok: true };
}

// The open-slot players this nominator could pick: this game day's pool, which already excludes
// everyone who is an active nominee (eligibility.ts). Name-or-email search, matched server-side
// against the real address - the caller only ever returns masked ones.
export function nominationCandidates(state: GameDayState, query: string): Player[] {
  const q = query.trim().toLowerCase();
  return Array.from(state.openSlotPoolIds)
    .map((id) => state.players.get(id)!)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20);
}

// ---- ending ----------------------------------------------------------------------------------

// Ends the given ACTIVE rows. The caller holds the game day's lock. Already-ended rows are left
// alone, so a reason is never overwritten.
export async function endNominations(tx: Db, ids: number[], reason: SlotNominationEndReason, now: Date): Promise<void> {
  if (ids.length === 0) return;
  await tx.gameDaySlotNomination.updateMany({
    where: { id: { in: ids }, endedAt: null },
    data: { endedAt: now, endReason: reason },
  });
}

// A player leaving one game day - the admin release (ADMIN_RELEASE) or a disabled player
// (PLAYER_DISABLED) - ends every active nomination they are on, from either side. When they were
// the NOMINEE, the nominator's IN goes too: it was cast on the nominee's behalf, and leaving it
// would silently turn "Bob is coming in my slot" into "I am coming", which the nominator never
// said (Decision 5). Returns the nominators whose posts need syncing. The caller holds the lock
// and runs the vacancy sync afterwards.
export async function endNominationsInvolving(
  tx: Db,
  gameDayId: number,
  playerId: number,
  reason: SlotNominationEndReason,
  now: Date
): Promise<number[]> {
  const active = await tx.gameDaySlotNomination.findMany({
    where: { gameDayId, endedAt: null, OR: [{ nominatorPlayerId: playerId }, { nomineePlayerId: playerId }] },
  });
  await endNominations(tx, active.map((n) => n.id), reason, now);
  for (const nomination of active) {
    if (nomination.nomineePlayerId === playerId) {
      await tx.gameDayVote.deleteMany({ where: { gameDayId, playerId: nomination.nominatorPlayerId } });
    }
  }
  return active.map((n) => n.nominatorPlayerId);
}

// Every active nomination on the game day - cancelGameDay (GAME_DAY_CANCELLED) and the session
// end (SESSION_ENDED). The caller holds the lock.
export async function endAllNominations(tx: Db, gameDayId: number, reason: SlotNominationEndReason, now: Date): Promise<number> {
  const { count } = await tx.gameDaySlotNomination.updateMany({
    where: { gameDayId, endedAt: null },
    data: { endedAt: now, endReason: reason },
  });
  return count;
}

// The scheduler's session-end step. A frozen nomination has no other way to end in the normal
// case, and left active it would block createSlotReplacement for good - a replacement window can
// start in the past. Its own step rather than part of Pass B, which only sees rows up to
// slotLockAt, and a session ends well after that.
export async function endFinishedSessionNominations(now: Date = new Date()): Promise<number> {
  const active = await prisma.gameDaySlotNomination.findMany({ where: { endedAt: null }, select: { gameDayId: true } });
  const gameDayIds = Array.from(new Set(active.map((n) => n.gameDayId))).sort((a, b) => a - b);
  let ended = 0;
  for (const gameDayId of gameDayIds) {
    try {
      ended += await withGameDayLock(gameDayId, async (tx, gameDay) =>
        isSessionOver(gameDay, now) ? endAllNominations(tx, gameDayId, 'SESSION_ENDED', now) : 0
      );
    } catch (error) {
      console.error(`[game-day] Failed to end finished nominations on game day ${gameDayId}`, error);
    }
  }
  return ended;
}

// ---- nominator actions -----------------------------------------------------------------------

// Create, or switch if the nominator already has one. The nominator comes from the session; the
// nominee is the OBJECT of the action, not an identity.
export async function nominate(
  squadId: number,
  gameDayId: number,
  nominatorId: number,
  nomineeId: number,
  now: Date = new Date()
): Promise<GameDaySlotNomination> {
  const nomination = await withGameDayLock(gameDayId, async (tx, gameDay) => {
    if (gameDay.squadId !== squadId) throw new ValidationError('Game day not found');
    const state = await loadGameDayState(tx, gameDay);
    const verdict = nominationVerdict(state, nominatorId, now);
    if (!verdict.ok) throw new ValidationError(verdict.reason);

    const existing = state.activeNominationByNominator.get(nominatorId);
    if (existing?.nomineePlayerId === nomineeId) return existing;

    // The pool already excludes every active nominee, so "not in the pool" covers someone else's
    // nominee - checked under the lock, so two nominators cannot both claim the same player.
    if (!state.openSlotPoolIds.has(nomineeId)) {
      const takenBy = state.activeNominationByNominee.get(nomineeId);
      throw new ValidationError(
        takenBy
          ? `${state.players.get(nomineeId)?.name ?? 'That player'} is already playing in someone else's slot`
          : 'You can only pass your slot to an open-slot player who has no slot on this game day'
      );
    }

    if (existing) await endNominations(tx, [existing.id], 'SWITCHED', now);
    // Deleted, not WITHDRAWN: WITHDRAWN is terminal, and they didn't give a slot back. Only a
    // WAITING row can exist - assignment happens after the deadline, and so no nomination can.
    await tx.gameDayOpenSlot.deleteMany({ where: { gameDayId, playerId: nomineeId, status: 'WAITING' } });
    // "Bob is taking my slot" means the slot is being used.
    await tx.gameDayVote.upsert({
      where: { gameDayId_playerId: { gameDayId, playerId: nominatorId } },
      create: { gameDayId, playerId: nominatorId, choice: 'IN', votedAt: now },
      update: { choice: 'IN', inheritedFromPlayerId: null },
    });
    return tx.gameDaySlotNomination.create({
      data: { gameDayId, nominatorPlayerId: nominatorId, nomineePlayerId: nomineeId, createdAt: now },
    });
  });
  await syncNominationPosts(gameDayId, nominatorId, now);
  return nomination;
}

// The nominator plays in their own slot after all. Their vote stays IN. The former nominee is
// back in the pool and can rejoin the waiting list - at the back.
export async function revokeNomination(squadId: number, gameDayId: number, nominatorId: number, now: Date = new Date()): Promise<void> {
  await withGameDayLock(gameDayId, async (tx, gameDay) => {
    if (gameDay.squadId !== squadId) throw new ValidationError('Game day not found');
    const state = await loadGameDayState(tx, gameDay);
    const existing = state.activeNominationByNominator.get(nominatorId);
    if (!existing) throw new ValidationError('You have not passed your slot on for this game day');
    const verdict = nominationVerdict(state, nominatorId, now);
    if (!verdict.ok) throw new ValidationError(verdict.reason);
    await endNominations(tx, [existing.id], 'REVOKED', now);
  });
  await syncNominationPosts(gameDayId, nominatorId, now);
}

// ---- the period-replacement guardrail (Decision 7) -------------------------------------------

// Why a new SlotReplacement may not be created, or null. Called inside createSlotReplacement's
// transaction AFTER reconcileSlotTransfer, which has already locked every live game day in the
// range - and nominations are only ever written under those locks, so a plain read is enough
// here (locking again, in nomination order rather than id order, could deadlock). Skips
// nominations whose session is over but which the scheduler has not stamped yet, so an outage
// cannot turn a finished hand-off into a block.
export async function findBlockingNomination(
  tx: Db,
  input: { squadId: number; ownerId: number; replacementId: number; fromDate: Date; toDate: Date },
  now: Date = new Date()
): Promise<string | null> {
  const active = await tx.gameDaySlotNomination.findMany({
    where: {
      endedAt: null,
      OR: [{ nominatorPlayerId: input.ownerId }, { nomineePlayerId: input.replacementId }],
    },
    orderBy: { id: 'asc' },
  });
  for (const nomination of active) {
    const gameDay = await tx.gameDay.findUnique({ where: { id: nomination.gameDayId } });
    if (
      !gameDay ||
      gameDay.squadId !== input.squadId ||
      gameDay.status === 'CANCELLED' ||
      gameDay.gameDate.getTime() < input.fromDate.getTime() ||
      gameDay.gameDate.getTime() > input.toDate.getTime() ||
      isSessionOver(gameDay, now)
    ) {
      continue;
    }
    const [nominator, nominee] = await Promise.all([
      tx.player.findUnique({ where: { id: nomination.nominatorPlayerId } }),
      tx.player.findUnique({ where: { id: nomination.nomineePlayerId } }),
    ]);
    const date = formatGameDate(isoFromDateOnly(gameDay.gameDate));
    const nomineeName = nominee?.name ?? 'someone';
    const nominatorName = nominator?.name ?? 'someone';
    const changeable = now.getTime() < gameDay.votesCloseAt.getTime();
    if (nomination.nominatorPlayerId === input.ownerId) {
      return changeable
        ? `You have passed your slot for ${date} to ${nomineeName} - revoke that first`
        : `Your hand-off to ${nomineeName} is already locked in for ${date}`;
    }
    return changeable
      ? `${nomineeName} is playing in ${nominatorName}'s slot on ${date} - ${nominatorName} has to revoke that first`
      : `${nomineeName} is playing in ${nominatorName}'s slot on ${date}, and that hand-off is already locked in`;
  }
  return null;
}
