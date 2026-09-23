// The open-slot waiting list and the vacancy sync (ATTENDANCE_VOTE_PLAN.md, "Open slots"). The
// sync is the core of the feature: voting closing, a holder dropping out after the deadline, an
// assignee giving their slot back, a direct claim, a slot transfer and an admin release are all
// the same event observed at different moments - "the gap may have changed" - so they are one
// operation in two halves:
//
//   planVacancySync(tx, id)  inside the CALLER's locked transaction: promote, compute the plan.
//   deliverVacancyPlan(plan) after the caller commits: tell the open-slot group.
//
// Assigning and announcing are separate on purpose. A missing chat id, a failed send, or an
// unchanged count may silence the post; nothing may ever silence the promotion.
import type { GameDayOpenSlot } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ValidationError } from '@/lib/api/validationError';
import { computeGameDayCounts } from './counts';
import { loadGameDayState, type Db } from './eligibility';
import { withGameDayLock } from './lock';
import { buildVacancyMessage } from './notifications';
import { logSend, messageContextFor, sendGameDayPost } from './telegram';

export interface VacancyPlan {
  gameDayId: number;
  // Every waiting-list promotion the group has not been told about yet - this pass's, plus any
  // an earlier failed send never announced. Without the latter, the retry of a lost "Ada and
  // Grace are in" post would carry only the count.
  promoted: { id: number; name: string }[];
  remaining: number;
  // Whether the open-slot group needs telling: there are unannounced promotions, or the open
  // count differs from what the group was last (successfully) told.
  changed: boolean;
  plannedAt: Date;
}

// The caller must hold the game day's row lock (withGameDayLock / lockGameDay) and must have
// written its own change - the ASSIGNED row of a direct claim, the OUT vote, the moved vote of a
// transfer - BEFORE calling this, or the counts will not see it. Never opens a transaction.
// Returns null when there is nothing to do at all.
export async function planVacancySync(tx: Db, gameDayId: number, now: Date = new Date()): Promise<VacancyPlan | null> {
  const gameDay = await tx.gameDay.findUnique({ where: { id: gameDayId } });
  if (!gameDay || gameDay.status !== 'VOTING_CLOSED' || gameDay.minPlayers === null) return null;
  // Nothing can realistically be filled this late: dropping out after the lock is information
  // for the admin, not a vacancy - no promotion, no post.
  if (now.getTime() >= gameDay.slotLockAt.getTime()) return null;

  const state = await loadGameDayState(tx, gameDay);
  const vacancies = computeGameDayCounts(state).vacancies ?? 0;

  // ALWAYS promote, whatever announcedVacancies says and whether or not a chat id exists.
  // Strictly first-come: joinedAt is the feature's only fairness guarantee.
  const waiting = state.openSlots
    .filter((s) => s.status === 'WAITING' && state.openSlotPoolIds.has(s.playerId))
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.id - b.id);
  const toPromote = waiting.slice(0, vacancies);
  for (const entry of toPromote) {
    await tx.gameDayOpenSlot.update({
      where: { id: entry.id },
      data: { status: 'ASSIGNED', source: 'WAITING_LIST', assignedAt: now },
    });
  }

  // Promoting n players raises slotsHeld by n on this same pass, so this reaches its floor here
  // and the sync cannot loop.
  const remaining = vacancies - toPromote.length;

  const announcedUpTo = gameDay.vacancyAnnouncedAt?.getTime() ?? -Infinity;
  const unannounced = [
    ...state.openSlots.filter(
      (s) =>
        s.status === 'ASSIGNED' &&
        s.source === 'WAITING_LIST' &&
        state.openSlotPoolIds.has(s.playerId) &&
        (s.assignedAt?.getTime() ?? 0) > announcedUpTo
    ),
    ...toPromote,
  ].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.id - b.id);

  return {
    gameDayId,
    promoted: unannounced.map((e) => ({ id: e.playerId, name: state.players.get(e.playerId)?.name ?? `#${e.playerId}` })),
    remaining,
    changed: unannounced.length > 0 || remaining !== gameDay.announcedVacancies,
    plannedAt: now,
  };
}

// After commit. announcedVacancies advances ONLY once the group has actually been told (or when
// there is nothing to tell and never will be): on a failed send it is left alone, so the next
// scheduler pass sees `changed` again and retries. That ordering is what makes the column's name
// honest - "what the group has been told", not "what we computed".
export async function deliverVacancyPlan(plan: VacancyPlan | null): Promise<void> {
  if (!plan || !plan.changed) return;
  try {
    const gameDay = await prisma.gameDay.findUnique({ where: { id: plan.gameDayId }, include: { squad: true } });
    if (!gameDay) return;
    const markAnnounced = () =>
      prisma.gameDay.update({
        where: { id: gameDay.id },
        data: { announcedVacancies: plan.remaining, vacancyAnnouncedAt: plan.plannedAt },
      });

    const message = buildVacancyMessage(messageContextFor(gameDay, gameDay.squad), {
      promotedNames: plan.promoted.map((p) => p.name),
      remaining: plan.remaining,
      previouslyAnnounced: gameDay.announcedVacancies,
      pingSent: gameDay.openSlotPingSent,
    });
    if (!message) {
      await markAnnounced();
      return;
    }
    const outcome = await sendGameDayPost(gameDay.squad, 'openSlot', message);
    logSend(gameDay.squad, `vacancy update for game day ${gameDay.id}`, outcome);
    // No open-slot chat id: nothing will ever be sent, so record the count and stop retrying.
    if (outcome.status !== 'failed') {
      await markAnnounced();
    }
  } catch (error) {
    // The promotions are already committed; a failure here only loses (and later retries) a post.
    console.error(`[game-day] Failed to deliver vacancy update for game day ${plan.gameDayId}`, error);
  }
}

export async function deliverVacancyPlans(plans: (VacancyPlan | null)[]): Promise<void> {
  for (const plan of plans) {
    await deliverVacancyPlan(plan);
  }
}

// Join the waiting list (voting open) or claim a slot directly (voting closed). The acting
// player comes from the session, never the request body - see the route.
export async function joinOpenSlot(
  squadId: number,
  gameDayId: number,
  playerId: number,
  now: Date = new Date()
): Promise<GameDayOpenSlot> {
  const { entry, plan } = await withGameDayLock(gameDayId, async (tx, gameDay) => {
    if (gameDay.squadId !== squadId) throw new ValidationError('Game day not found');
    if (gameDay.status === 'CANCELLED') throw new ValidationError('This game day has been cancelled');
    if (gameDay.minPlayers === null) throw new ValidationError('This game day has no open slots');
    if (now.getTime() >= gameDay.slotLockAt.getTime()) {
      throw new ValidationError('Too late - open slots lock 2 hours before the session starts');
    }

    const state = await loadGameDayState(tx, gameDay);
    if (!state.openSlotPoolIds.has(playerId)) {
      throw new ValidationError(
        state.structuralHolderIds.has(playerId)
          ? 'You already hold a slot on this game day - vote in or out instead'
          : 'Only open-slot players can join the waiting list'
      );
    }

    const existing = state.openSlots.find((s) => s.playerId === playerId);
    if (existing?.status === 'WITHDRAWN') {
      // Terminal: having been given a slot and handed it back, you do not go back in the queue
      // ahead of people who have been waiting.
      throw new ValidationError('You gave your slot for this game day back, so you cannot rejoin');
    }
    if (existing?.status === 'ASSIGNED') {
      return { entry: existing, plan: null };
    }

    if (gameDay.status === 'VOTING_OPEN') {
      // The waiting list is open from creation - the 09:00 ping is an announcement, not a gate.
      if (existing) return { entry: existing, plan: null };
      const created = await tx.gameDayOpenSlot.create({ data: { gameDayId, playerId, status: 'WAITING', joinedAt: now } });
      return { entry: created, plan: null };
    }

    // VOTING_CLOSED: a direct claim, recomputed inside the lock so two concurrent claims for the
    // last slot leave exactly one winner.
    const vacancies = computeGameDayCounts(state).vacancies ?? 0;
    if (vacancies <= 0) {
      throw new ValidationError('No open slots available');
    }
    // Inserted BEFORE the sync counts, or the claim would not be in the count.
    const claimed = existing
      ? await tx.gameDayOpenSlot.update({
          where: { id: existing.id },
          data: { status: 'ASSIGNED', source: 'DIRECT', assignedAt: now },
        })
      : await tx.gameDayOpenSlot.create({
          data: { gameDayId, playerId, status: 'ASSIGNED', source: 'DIRECT', joinedAt: now, assignedAt: now },
        });
    // A direct claim is a sync call site too: it lowers the real vacancy count, and skipping the
    // sync would leave announcedVacancies stale - the next OUT that happened to bring the count
    // back to that stale number would then look unchanged.
    return { entry: claimed, plan: await planVacancySync(tx, gameDayId, now) };
  });
  await deliverVacancyPlan(plan);
  return entry;
}

// Leave the WAITING list only - it is just a queue, so the row is deleted and can be re-created.
// Giving up an ASSIGNED slot is castVote(OUT) (Decision 6), never this.
export async function leaveOpenSlot(squadId: number, gameDayId: number, playerId: number): Promise<void> {
  await withGameDayLock(gameDayId, async (tx, gameDay) => {
    if (gameDay.squadId !== squadId) throw new ValidationError('Game day not found');
    const existing = await tx.gameDayOpenSlot.findUnique({ where: { gameDayId_playerId: { gameDayId, playerId } } });
    if (!existing || existing.status === 'WITHDRAWN') {
      throw new ValidationError('You are not on the waiting list for this game day');
    }
    if (existing.status === 'ASSIGNED') {
      throw new ValidationError('You hold a slot on this game day - use "I\'m out" to give it back');
    }
    await tx.gameDayOpenSlot.delete({ where: { id: existing.id } });
  });
}
