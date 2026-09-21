// Schedule-derived "playing day" calculator (OPEN_SLOT_PLAYERS_PLAN.md). Pure, squad-agnostic -
// for *forward-looking* date-range questions only ("does this proposed date range cover >= 3
// playing days?", "which dates does it resolve to?"). NOT the right source for "how many game
// days since this player last played" - see absenteeSpell.ts's file comment for why (the
// schedule is informational-only and can drift from what actually got processed).
//
// Squads currently support only one playing day/week - written against that shape now; multiple
// days/week is a schedule-model change, not a rewrite of this calculator.
import type { SquadScheduleData, DayOfWeek } from '@/lib/squadSchedule';

const DAY_INDEX: Record<DayOfWeek, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isPlayingDay(schedule: SquadScheduleData, date: Date): boolean {
  if (!schedule.isRecurring || !schedule.dayOfWeek) return false;
  const day = toUtcDateOnly(date);
  if (day.getUTCDay() !== DAY_INDEX[schedule.dayOfWeek]) return false;
  const dayString = dateOnlyString(day);
  if (schedule.startDate && dayString < schedule.startDate) return false;
  if (schedule.endDate && dayString > schedule.endDate) return false;
  if (schedule.skipDates.includes(dayString)) return false;
  return true;
}

// Counts playing days in (fromExclusive, toInclusive]. To include a range's own start date, pass
// the day before it as fromExclusive.
export function countPlayingDaysBetween(schedule: SquadScheduleData, fromExclusive: Date, toInclusive: Date): number {
  let count = 0;
  const cursor = toUtcDateOnly(fromExclusive);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  const end = toUtcDateOnly(toInclusive);
  while (cursor.getTime() <= end.getTime()) {
    if (isPlayingDay(schedule, cursor)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// Inclusive of both endpoints - for surfacing the resolved dates in the nomination UI.
export function getPlayingDatesInRange(schedule: SquadScheduleData, from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cursor = toUtcDateOnly(from);
  const end = toUtcDateOnly(to);
  while (cursor.getTime() <= end.getTime()) {
    if (isPlayingDay(schedule, cursor)) dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
