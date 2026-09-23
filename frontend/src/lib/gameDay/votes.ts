// In/out votes (ATTENDANCE_VOTE_PLAN.md, "Vote rules"). evaluateVote is the whole rule table as
// one pure function - castVote enforces it inside the game day's row lock, and the page view
// uses the same function to decide which buttons to offer, so the two cannot drift.
//
// | Voter                              | Voting open | Closed, before slotLockAt          | After slotLockAt          |
// |------------------------------------|-------------|------------------------------------|---------------------------|
// | Structural holder                  | IN/OUT      | IN rejected; OUT only from an IN   | OUT allowed, reopens none |
// | Structural, gained slot after close| n/a         | IN allowed; OUT allowed            | IN rejected; OUT allowed  |
// | Assigned, WAITING_LIST             | n/a         | IN allowed; OUT releases the slot  | OUT rejected              |
// | Assigned, DIRECT                   | n/a         | IN allowed; OUT rejected           | same                      |
// | Anyone else                        | rejected    | rejected                           | rejected                  |
//
// CANCELLED rejects everything.
import type { GameDayStatus, GameDayVote, OpenSlotClaimSource, VoteChoice } from '@prisma/client';
import { ValidationError } from '@/lib/api/validationError';
import { loadGameDayState, type GameDayState } from './eligibility';
import { withGameDayLock } from './lock';
import { endNominations, nominatorNameFor, nomineeRefusal } from './nominations';
import { syncNominationPosts } from './nominationPosts';
import { deliverVacancyPlan, planVacancySync } from './openSlots';

// NOMINEE: playing in someone else's slot through a one-day nomination (SINGLE_DAY_NOMINATION_
// PLAN.md). Not a voter - the nominator keeps the slot's vote - and not in the pool either.
export type Holding = 'STRUCTURAL' | 'ASSIGNED' | 'NOMINEE' | 'OPEN_SLOT_POOL' | 'NONE';

export interface VoteContext {
  status: GameDayStatus;
  now: Date;
  slotLockAt: Date;
  holding: Holding;
  source: OpenSlotClaimSource | null; // when ASSIGNED
  nominatorName: string | null; // when NOMINEE
  vote: Pick<GameDayVote, 'choice' | 'inheritedFromPlayerId'> | null;
}

export type VoteVerdict = { ok: true } | { ok: false; reason: string };

const VOTING_CLOSED = 'Voting has closed';

export function evaluateVote(ctx: VoteContext, choice: VoteChoice): VoteVerdict {
  if (ctx.status === 'CANCELLED') return { ok: false, reason: 'This game day has been cancelled' };
  if (ctx.holding === 'NOMINEE') return { ok: false, reason: nomineeRefusal(ctx.nominatorName ?? 'The slot holder') };
  if (ctx.holding === 'OPEN_SLOT_POOL') {
    return { ok: false, reason: 'You do not hold a slot on this game day - join the waiting list instead' };
  }
  if (ctx.holding === 'NONE') return { ok: false, reason: 'You do not hold a slot on this game day' };

  if (ctx.status === 'VOTING_OPEN') return { ok: true };

  const pastLock = ctx.now.getTime() >= ctx.slotLockAt.getTime();

  if (ctx.holding === 'ASSIGNED') {
    if (choice === 'IN') return { ok: true }; // their confirmation
    if (ctx.source === 'DIRECT') return { ok: false, reason: 'This slot is yours - you claimed it directly' };
    if (pastLock) return { ok: false, reason: 'Too late to give the slot back - it is too close to the session to refill' };
    return { ok: true };
  }

  // Structural holder, voting closed. A row stamped inheritedFromPlayerId means the slot came to
  // them after the deadline (reconcile.ts): they never had a chance to vote while it was open,
  // so they get an assignee's right to confirm until slotLockAt.
  const gainedAfterClose = ctx.vote !== null && ctx.vote.inheritedFromPlayerId !== null;
  const currentChoice = ctx.vote?.choice ?? null;

  if (choice === 'IN') {
    if (currentChoice === 'IN' && !gainedAfterClose) return { ok: true }; // already in - no-op
    if (gainedAfterClose && !pastLock) return { ok: true };
    return { ok: false, reason: VOTING_CLOSED };
  }
  // OUT: only from a current IN (own or inherited), or from a slot gained after the deadline.
  // Reaching the deadline with no vote at all already means out, so there is nothing to record -
  // rejected with the same message as IN rather than writing a row that means nothing.
  if (currentChoice === 'OUT' && !gainedAfterClose) return { ok: true }; // already out - no-op
  if (currentChoice === 'IN' || gainedAfterClose) return { ok: true };
  return { ok: false, reason: VOTING_CLOSED };
}

export function holdingOf(state: GameDayState, playerId: number): Holding {
  if (state.structuralHolderIds.has(playerId)) return 'STRUCTURAL';
  if (state.assignedIds.has(playerId)) return 'ASSIGNED';
  if (state.activeNominationByNominee.has(playerId)) return 'NOMINEE';
  if (state.openSlotPoolIds.has(playerId)) return 'OPEN_SLOT_POOL';
  return 'NONE';
}

export function voteContextFor(state: GameDayState, playerId: number, now: Date): VoteContext {
  const holding = holdingOf(state, playerId);
  const entry = state.openSlots.find((s) => s.playerId === playerId);
  const vote = state.votes.find((v) => v.playerId === playerId) ?? null;
  return {
    status: state.gameDay.status,
    now,
    slotLockAt: state.gameDay.slotLockAt,
    holding,
    source: holding === 'ASSIGNED' ? entry?.source ?? null : null,
    nominatorName: holding === 'NOMINEE' ? nominatorNameFor(state, playerId) : null,
    vote,
  };
}

// The acting player comes from the session (the route resolves it), never the request body.
export async function castVote(
  squadId: number,
  gameDayId: number,
  playerId: number,
  choice: VoteChoice,
  now: Date = new Date()
): Promise<GameDayVote> {
  const { vote, plan, endedNomination } = await withGameDayLock(gameDayId, async (tx, gameDay) => {
    if (gameDay.squadId !== squadId) throw new ValidationError('Game day not found');

    const state = await loadGameDayState(tx, gameDay);
    const ctx = voteContextFor(state, playerId, now);
    const verdict = evaluateVote(ctx, choice);
    if (!verdict.ok) throw new ValidationError(verdict.reason);

    // An OUT means nobody from this slot is coming, so it voids the nominator's hand-off -
    // permanently: a later IN is the nominator themselves, never the nominee coming back
    // (SINGLE_DAY_NOMINATION_PLAN.md, Decision 5). Ended BEFORE the sync plans, so a
    // post-deadline OUT's vacancy is promoted into on this same pass.
    const nomination = choice === 'OUT' ? state.activeNominationByNominator.get(playerId) : undefined;
    if (nomination) await endNominations(tx, [nomination.id], 'NOMINATOR_OUT', now);

    // Voting for yourself always clears an inherited stamp: an inherited IN becomes your own
    // confirmation without moving slotsHeld; an OUT drops the reservation.
    const written = await tx.gameDayVote.upsert({
      where: { gameDayId_playerId: { gameDayId, playerId } },
      create: { gameDayId, playerId, choice, votedAt: now },
      update: { choice, inheritedFromPlayerId: null },
    });

    // Voting OUT and giving up an assigned slot are one action, in one transaction - two
    // operations would let the vote and the slot disagree.
    if (ctx.holding === 'ASSIGNED' && choice === 'OUT') {
      await tx.gameDayOpenSlot.update({
        where: { gameDayId_playerId: { gameDayId, playerId } },
        data: { status: 'WITHDRAWN', withdrawnAt: now },
      });
    }

    return { vote: written, plan: await planVacancySync(tx, gameDayId, now), endedNomination: nomination !== undefined };
  });
  await deliverVacancyPlan(plan);
  if (endedNomination) await syncNominationPosts(gameDayId, playerId, now);
  return vote;
}
