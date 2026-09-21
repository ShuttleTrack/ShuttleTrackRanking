// OPEN_SLOT_PLAYERS_PLAN.md "Keeping the public leaderboard & score graph uncluttered". An
// open-slot player gets real rankScore/playerRank/ScoreHistory when they play and is
// deliberately never auto-deactivated for going quiet (see scorePersister.ts's Path 3), so left
// unfiltered they'd permanently clutter the two squad-wide aggregate views. This is additive
// filtering only, layered on top of whatever active-status filtering a caller already applies
// (e.g. a null rankScore/playerRank for an inactive player) - it only ever further *removes*
// stale open-slot players, never adds anyone back.
import { PlayerType } from '@prisma/client';
import prisma from '@/lib/prisma';
import { gameDaysSinceLastPlay } from './absenteeSpell';

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// FULLTIME -> always visible. Currently covered by an active SlotReplacement -> always visible
// (standing in as fulltime). Plain OPEN_SLOT -> visible only while game days since their last
// play are within the squad's openSlotVisibilityGameDays (never played -> not visible at all).
export async function filterBoardVisible<T extends { id: number; playerType: PlayerType }>(
  squadId: number,
  players: T[],
  asOf: Date = todayDateOnly()
): Promise<T[]> {
  const activeReplacements = await prisma.slotReplacement.findMany({
    where: { squadId, cancelledAt: null, startDate: { lte: asOf }, endDate: { gte: asOf } },
    select: { replacementPlayerId: true },
  });
  const activeReplacementIds = new Set(activeReplacements.map((r) => r.replacementPlayerId));

  const hasOpenSlotToCheck = players.some(
    (p) => p.playerType === PlayerType.OPEN_SLOT && !activeReplacementIds.has(p.id)
  );
  const graceDays = hasOpenSlotToCheck
    ? (
        await prisma.squad.findUniqueOrThrow({
          where: { id: squadId },
          select: { openSlotVisibilityGameDays: true },
        })
      ).openSlotVisibilityGameDays
    : 0;

  const result: T[] = [];
  for (const player of players) {
    if (player.playerType === PlayerType.FULLTIME || activeReplacementIds.has(player.id)) {
      result.push(player);
      continue;
    }
    const spellDays = await gameDaysSinceLastPlay(squadId, player.id, asOf);
    if (spellDays !== null && spellDays <= graceDays) {
      result.push(player);
    }
  }
  return result;
}
