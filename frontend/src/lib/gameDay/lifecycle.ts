// Status transitions of a game day, shared by the scheduler and the admin route - the admin
// "close voting" action goes through exactly the close-and-sync path the cron does rather than
// setting the status directly (resolved open question 5).
import prisma from '@/lib/prisma';
import { ValidationError } from '@/lib/api/validationError';
import { GAME_DAY_TX_OPTIONS, withGameDayLock } from './lock';
import { buildCancellationMessage } from './notifications';
import { deliverVacancyPlan, deliverVacancyPlans, planVacancySync } from './openSlots';
import { removePlayerFromGameDay, removePlayerFromGameDays } from './reconcile';
import { logSend, messageContextFor, sendGameDayPost } from './telegram';

// Freezes attendance, then fills the gap from the waiting list. Idempotent: closing an
// already-closed (or cancelled) game day does nothing.
export async function closeVoting(gameDayId: number, now: Date = new Date()): Promise<boolean> {
  const { closed, plan } = await withGameDayLock(gameDayId, async (tx, gameDay) => {
    if (gameDay.status !== 'VOTING_OPEN') return { closed: false, plan: null };
    await tx.gameDay.update({ where: { id: gameDayId }, data: { status: 'VOTING_CLOSED', votingClosedAt: now } });
    return { closed: true, plan: await planVacancySync(tx, gameDayId, now) };
  });
  await deliverVacancyPlan(plan);
  return closed;
}

// Terminal (resolved open question 6): removing a skipDate later creates a brand-new row with an
// empty vote rather than un-cancelling this one. Tells the main group when it had already been
// told to vote (resolved open question 4).
export async function cancelGameDay(gameDayId: number, reason: string): Promise<boolean> {
  const cancelled = await withGameDayLock(gameDayId, async (tx, gameDay) => {
    if (gameDay.status === 'CANCELLED') return false;
    await tx.gameDay.update({ where: { id: gameDayId }, data: { status: 'CANCELLED' } });
    return true;
  });
  if (!cancelled) return false;

  try {
    const gameDay = await prisma.gameDay.findUnique({ where: { id: gameDayId }, include: { squad: true } });
    if (gameDay?.announcedAt) {
      const outcome = await sendGameDayPost(
        gameDay.squad,
        'main',
        buildCancellationMessage(messageContextFor(gameDay, gameDay.squad), reason)
      );
      logSend(gameDay.squad, `cancellation of game day ${gameDayId}`, outcome);
    }
  } catch (error) {
    console.error(`[game-day] Failed to announce cancellation of game day ${gameDayId}`, error);
  }
  return true;
}

// Disabling must not strand open rows: a squad the scheduler no longer sweeps would otherwise
// leave its VOTING_OPEN rows accepting votes forever and never closing. Called from BOTH ways a
// squad stops running check-in - turning gameDayOps off (the game-day-ops route) and disabling
// the squad itself from platform admin (PATCH /api/squads/[squadId]), which is a different
// handler.
export async function cancelOpenGameDays(squadId: number, reason: string): Promise<number> {
  const open = await prisma.gameDay.findMany({ where: { squadId, status: 'VOTING_OPEN' }, select: { id: true } });
  let count = 0;
  for (const { id } of open) {
    if (await cancelGameDay(id, reason)) count++;
  }
  return count;
}

// A player set DISABLED is in no pool (eligibility.ts), and the counts already ignore rows left
// by someone who is no longer a voter - so this is hygiene plus a prompt vacancy sync, not what
// keeps the counts right. Best-effort by design: it runs after the ranking path's own
// transaction has committed, and a failure here must never surface as a failed deactivation.
export async function removeDisabledPlayerFromGameDays(squadId: number, playerId: number): Promise<void> {
  try {
    const plans = await prisma.$transaction(
      (tx) => removePlayerFromGameDays(tx, squadId, playerId),
      GAME_DAY_TX_OPTIONS
    );
    await deliverVacancyPlans(plans);
  } catch (error) {
    console.error(`[game-day] Failed to clear disabled player ${playerId} from squad ${squadId}'s game days`, error);
  }
}

// Admin release of one player's slot (the vote-rules section's escape hatch): the only way an
// unconfirmed DIRECT claim - which its holder cannot vote out of - ever frees its slot. Not a
// transfer (nobody takes the slot over): the entry is WITHDRAWN, their vote row goes, and the
// vacancy sync runs as for any other widening of the gap.
export async function releaseSlot(squadId: number, gameDayId: number, playerId: number, now: Date = new Date()): Promise<void> {
  const plan = await withGameDayLock(gameDayId, async (tx, gameDay) => {
    if (gameDay.squadId !== squadId) throw new ValidationError('Game day not found');
    if (gameDay.status === 'CANCELLED') throw new ValidationError('This game day has been cancelled');
    const [vote, entry] = await Promise.all([
      tx.gameDayVote.findUnique({ where: { gameDayId_playerId: { gameDayId, playerId } } }),
      tx.gameDayOpenSlot.findUnique({ where: { gameDayId_playerId: { gameDayId, playerId } } }),
    ]);
    if (!vote && (!entry || entry.status === 'WITHDRAWN')) {
      throw new ValidationError('That player holds nothing on this game day to release');
    }
    return removePlayerFromGameDay(tx, gameDayId, playerId, 'withdraw', now);
  });
  await deliverVacancyPlan(plan);
}
