// Mirrors java.time.temporal.TemporalAdjusters.next(DayOfWeek): the first date *strictly after*
// `from` that falls on `targetDayOfWeek` - never returns `from` itself even if it already
// matches (MIGRATION_PLAN.md Phase 6, EncounterScheduler.sendEncounterPoll).

export type DayName = 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';

// JS Date's getUTCDay()/getDay() use Sunday=0..Saturday=6, unlike Java's DayOfWeek
// (Monday=1..Sunday=7) - named here to avoid mixing the two numbering schemes up.
const DAY_NAME_TO_JS_DAY: Record<DayName, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export function nextOccurrenceOf(targetDay: DayName, from: Date): Date {
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const targetJsDay = DAY_NAME_TO_JS_DAY[targetDay];
  let daysToAdd = (targetJsDay - base.getUTCDay() + 7) % 7;
  if (daysToAdd === 0) daysToAdd = 7; // "next", never today
  base.setUTCDate(base.getUTCDate() + daysToAdd);
  return base;
}

export function dayNameOf(date: Date): DayName {
  const names: DayName[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return names[date.getUTCDay()];
}
