// One lock, one transaction, one commit per game-day write (ATTENDANCE_VOTE_PLAN.md,
// "Concurrency needs a real row lock"). The SlotReplacement transaction an earlier revision cited
// as precedent does a plain findFirst-then-create with no row lock, so two concurrent writers can
// both pass its check; racing claims for the last slot come from DIFFERENT players, so no unique
// index helps either. Every entry point here therefore starts its transaction with
// SELECT ... FOR UPDATE on the GameDay row.
//
// READ COMMITTED rather than InnoDB's default REPEATABLE READ: under RR, a transaction's snapshot
// is fixed by its first plain read, and a caller that read anything before taking this lock (the
// replacement overlap check does) would then count votes from before a concurrent writer
// committed. Under RC every statement after the lock sees the latest committed rows, and every
// writer to those rows holds the same lock.
import { Prisma, type GameDay } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ValidationError } from '@/lib/api/validationError';
import type { Db } from './eligibility';

export const GAME_DAY_TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  // Several game days and a vacancy sync can share one transaction (a replacement transfer).
  timeout: 20_000,
};

// For a caller already inside a transaction (the replacement paths): lock the row and return
// its current state. Lock several rows in ascending id order to avoid deadlocking a concurrent
// caller doing the same.
export async function lockGameDay(tx: Db, gameDayId: number): Promise<GameDay | null> {
  await tx.$queryRaw`SELECT id FROM GAME_DAY WHERE id = ${gameDayId} FOR UPDATE`;
  return tx.gameDay.findUnique({ where: { id: gameDayId } });
}

// The outermost caller owns the lock, the transaction and - after commit - any Telegram send.
// Nothing called inside `fn` may open a transaction of its own: that would be a second
// connection waiting on the lock this one holds.
export async function withGameDayLock<T>(gameDayId: number, fn: (tx: Db, gameDay: GameDay) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const gameDay = await lockGameDay(tx, gameDayId);
    if (!gameDay) {
      throw new ValidationError('Game day not found');
    }
    return fn(tx, gameDay);
  }, GAME_DAY_TX_OPTIONS);
}
