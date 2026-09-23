// Eligibility is live; the rows already written are not (ATTENDANCE_VOTE_PLAN.md, "Eligibility
// is live"). A vote opens days ahead and a SlotReplacement can be created, cancelled or
// shortened in that window covering the same date, so these functions keep the game day's rows
// matching getGameDayVoters. They run INSIDE the replacement change's own transaction and return
// vacancy plans for the caller to deliver after it commits.
//
// Rule: the slot transfers; the vote does not - every person speaks for themselves. Nobody
// inherits someone else's confirmation. But after the deadline a transferred IN must still HOLD
// its slot, or the sync would promote a waiting-list player into it and the incoming holder's
// later IN would fill one physical slot twice. So after the deadline the outgoing IN row moves
// to the incoming holder as an inherited RESERVATION (inheritedFromPlayerId): in slotsHeld, not
// in confirmedIn, cleared by their own vote.
import type { GameDay } from '@prisma/client';
import { isoFromDateOnly } from './clock';
import type { Db } from './eligibility';
import { lockGameDay } from './lock';
import { planVacancySync, type VacancyPlan } from './openSlots';
import { sessionPhase } from './voteWindow';

// Scope: game days that already exist, are VOTING_OPEN or VOTING_CLOSED, and whose session has
// not ended - today's included. "Future only" would be wrong: today's already-closed vote is
// exactly the row that must drop a replaced or disabled player's IN. Never walks the (up to four
// month) replacement window and never creates a game day in order to reconcile it - a date with
// no row has nothing to reconcile, and the scheduler will create it correctly later.
async function liveGameDays(
  tx: Db,
  squadId: number,
  now: Date,
  range?: { fromDate: Date; toDate: Date }
): Promise<GameDay[]> {
  const rows = await tx.gameDay.findMany({
    where: {
      squadId,
      status: { in: ['VOTING_OPEN', 'VOTING_CLOSED'] },
      ...(range ? { gameDate: { gte: range.fromDate, lte: range.toDate } } : {}),
    },
    orderBy: { id: 'asc' }, // lock order - see lockGameDay
  });
  return rows.filter(
    (gd) =>
      sessionPhase(
        { gameDate: isoFromDateOnly(gd.gameDate), startTime: gd.startTime, endTime: gd.endTime, timezone: gd.timezone },
        now
      ) !== 'ended'
  );
}

export interface SlotTransfer {
  squadId: number;
  outgoingPlayerId: number;
  incomingPlayerId: number;
  fromDate: Date; // inclusive, date-only
  toDate: Date; // inclusive, date-only
}

// A two-sided transfer, not a per-player sweep: called from both sides a per-player helper
// would delete the incoming holder's vote too. Callers: createSlotReplacement (owner -> filler),
// and approveCancellationRequest for both an outright cancellation and a shorten (filler ->
// owner, over the dates the window no longer covers).
export async function reconcileSlotTransfer(tx: Db, transfer: SlotTransfer, now: Date = new Date()): Promise<VacancyPlan[]> {
  const { outgoingPlayerId, incomingPlayerId } = transfer;
  const plans: VacancyPlan[] = [];

  for (const candidate of await liveGameDays(tx, transfer.squadId, now, transfer)) {
    const gameDay = await lockGameDay(tx, candidate.id);
    if (!gameDay || gameDay.status === 'CANCELLED') continue;
    const gameDayId = gameDay.id;

    const [outgoingVote, incomingVote] = await Promise.all([
      tx.gameDayVote.findUnique({ where: { gameDayId_playerId: { gameDayId, playerId: outgoingPlayerId } } }),
      tx.gameDayVote.findUnique({ where: { gameDayId_playerId: { gameDayId, playerId: incomingPlayerId } } }),
    ]);

    // The incoming holder cannot hold a structural slot and an open slot at once. DELETED, not
    // WITHDRAWN: WITHDRAWN is terminal, and a system action they did not take must not stop
    // them rejoining the queue if this window is later cancelled.
    await tx.gameDayOpenSlot.deleteMany({ where: { gameDayId, playerId: incomingPlayerId } });

    if (gameDay.status === 'VOTING_OPEN') {
      // Nothing is promoted while voting is open, so no reservation is needed: the outgoing
      // holder's vote goes, and the incoming holder votes for themselves like anyone else.
      if (outgoingVote) await tx.gameDayVote.delete({ where: { id: outgoingVote.id } });
    } else if (incomingVote && incomingVote.choice === 'IN' && incomingVote.inheritedFromPlayerId === null) {
      // They had already confirmed themselves (as an assignee): their own IN stands, and it now
      // counts as a structural IN. The outgoing vote goes; the open slot they were holding is
      // now genuinely free for the sync.
      if (outgoingVote) await tx.gameDayVote.delete({ where: { id: outgoingVote.id } });
    } else {
      // Any other row of theirs predates this slot (an OUT from a withdrawn assignment) and says
      // nothing about it.
      if (incomingVote) await tx.gameDayVote.delete({ where: { id: incomingVote.id } });
      if (outgoingVote?.choice === 'IN') {
        // Move the row: the reservation, with the audit trail of where the slot came from.
        await tx.gameDayVote.update({
          where: { id: outgoingVote.id },
          data: { playerId: incomingPlayerId, inheritedFromPlayerId: outgoingPlayerId },
        });
      } else {
        // An OUT or absent vote reserved nothing, so nothing is inherited - but the incoming
        // holder still gained a slot after the deadline and needs the right to confirm it. A
        // choice-less inherited row records exactly that; it counts nowhere.
        if (outgoingVote) await tx.gameDayVote.delete({ where: { id: outgoingVote.id } });
        await tx.gameDayVote.create({
          data: { gameDayId, playerId: incomingPlayerId, choice: null, inheritedFromPlayerId: outgoingPlayerId, votedAt: now },
        });
      }
    }

    const plan = await planVacancySync(tx, gameDayId, now);
    if (plan) plans.push(plan);
  }
  return plans;
}

// One player out of one game day - no incoming side. `withdraw` marks an open-slot entry
// WITHDRAWN (the admin release: the slot was deliberately taken back, and WITHDRAWN is
// terminal); `delete` removes it (a DISABLED player, who may one day be re-enabled).
export async function removePlayerFromGameDay(
  tx: Db,
  gameDayId: number,
  playerId: number,
  mode: 'withdraw' | 'delete',
  now: Date = new Date()
): Promise<VacancyPlan | null> {
  await tx.gameDayVote.deleteMany({ where: { gameDayId, playerId } });
  if (mode === 'delete') {
    await tx.gameDayOpenSlot.deleteMany({ where: { gameDayId, playerId } });
  } else {
    await tx.gameDayOpenSlot.updateMany({
      where: { gameDayId, playerId, status: { in: ['WAITING', 'ASSIGNED'] } },
      data: { status: 'WITHDRAWN', withdrawnAt: now },
    });
  }
  return planVacancySync(tx, gameDayId, now);
}

// The DISABLED case, across every live game day of the squad.
export async function removePlayerFromGameDays(
  tx: Db,
  squadId: number,
  playerId: number,
  now: Date = new Date()
): Promise<VacancyPlan[]> {
  const plans: VacancyPlan[] = [];
  for (const candidate of await liveGameDays(tx, squadId, now)) {
    const gameDay = await lockGameDay(tx, candidate.id);
    if (!gameDay || gameDay.status === 'CANCELLED') continue;
    const plan = await removePlayerFromGameDay(tx, gameDay.id, playerId, 'delete', now);
    if (plan) plans.push(plan);
  }
  return plans;
}
