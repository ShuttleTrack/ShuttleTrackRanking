// Backward-looking "how many game days since this player last played" (OPEN_SLOT_PLAYERS_PLAN.md
// - "Backward-looking helper: game days since last play"). Deliberately *not* derived from
// Squad.schedule: that recurrence blob is informational-only, can be null/non-recurring, and a
// cancelled session nobody added to skipDates would count as a playing day to that calculator
// while producing no absentee sweep - drifting ahead of the escalation counter, which keys off
// actual ScoreHistory rows. The ground truth here is the database itself: distinct
// Encounter.encounterDate values, which matches the absentee sweep's own clock exactly (one
// sweep per processed encounter date) and needs no schedule at all.
import prisma from '@/lib/prisma';

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Most recent ScoreHistory row that represents an actual match (encounterId > 0), excluding the
// -1/-2/-3 absentee/deactivate/activate sentinels (absenteeManager.ts).
async function lastRealPlayDate(playerId: number): Promise<Date | null> {
  const row = await prisma.scoreHistory.findFirst({
    where: { playerId, encounterId: { gt: 0 } },
    orderBy: { encounterDate: 'desc' },
  });
  return row?.encounterDate ?? null;
}

async function distinctSquadGameDaysAfter(squadId: number, afterExclusive: Date, upToInclusive: Date): Promise<number> {
  const groups = await prisma.encounter.groupBy({
    by: ['encounterDate'],
    where: {
      squadId,
      processed: true,
      encounterDate: { gt: afterExclusive, lte: upToInclusive },
    },
  });
  return groups.length;
}

// The general form: consecutive missed game days in `(max(lastRealPlayDate, the game day before
// notBefore), asOf]`. With no `notBefore` this is exactly "game days since last play". With
// `notBefore` set (a replacement window's startDate) it answers "how many game days of this
// window have they missed in a row", clamping away any dormancy from before the window so it
// can't pre-load the ramp. Returns null only when the player has never played *and* no clamp was
// given - callers use that to distinguish "never played" from "played long ago".
export async function absenteeSpellDays(
  squadId: number,
  playerId: number,
  asOf: Date,
  notBefore?: Date
): Promise<number | null> {
  const lastPlayed = await lastRealPlayDate(playerId);
  const clampFrom = notBefore ? addUtcDays(notBefore, -1) : null;

  const effectiveAfter =
    lastPlayed && clampFrom ? (lastPlayed > clampFrom ? lastPlayed : clampFrom) : (lastPlayed ?? clampFrom);

  if (!effectiveAfter) return null;
  return distinctSquadGameDaysAfter(squadId, effectiveAfter, asOf);
}

export async function gameDaysSinceLastPlay(squadId: number, playerId: number, asOf: Date): Promise<number | null> {
  return absenteeSpellDays(squadId, playerId, asOf);
}
