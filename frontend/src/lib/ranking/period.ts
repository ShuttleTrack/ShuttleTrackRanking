// Ported from PlayerService.getPlayerInfoByStatus:
//   Period period = Period.between(LocalDate.now(), e.getRankSince());
//   int diff = Math.abs(period.getDays());
//   ... diff + " day(s)"
//
// java.time.Period#getDays() returns only the *day component* of the years/months/days
// breakdown between the two dates, not the total elapsed days. For dates in the same or
// adjacent month this is close to "days ago", but across a wider month gap it understates
// badly - e.g. 2026-08-17 -> 2026-09-19 is 33 elapsed days but Period.getDays() is 2 (see
// periodDaysBetween.test.ts, which reproduces this exact case from the real Phase 1 data
// dump). This is almost certainly a latent display bug in the original, not intentional -
// verified in this session against real player "navanji" (rank_since 2026-08-17). Preserved
// here exactly per the Phase 0 characterization philosophy: port behavior as it actually
// runs, bugs included, rather than silently fixing it. Flagged in MIGRATION_PLAN.md for the
// user to decide whether to fix during/after cutover.

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

// Mirrors java.time.LocalDate#plusMonths: clamps the day-of-month to the target month's length.
function plusMonths(date: Date, monthsToAdd: number): Date {
  const totalMonth0 = date.getUTCFullYear() * 12 + date.getUTCMonth() + monthsToAdd;
  const newYear = Math.floor(totalMonth0 / 12);
  const newMonth0 = ((totalMonth0 % 12) + 12) % 12;
  const newDay = Math.min(date.getUTCDate(), daysInMonth(newYear, newMonth0));
  return new Date(Date.UTC(newYear, newMonth0, newDay));
}

function epochDay(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000);
}

// Mirrors java.time.LocalDate#until(ChronoLocalDate), the algorithm behind Period.between.
// Returns only the `days` component (what Period#getDays() exposes), not total elapsed days.
export function periodDaysBetween(start: Date, end: Date): number {
  const prolepticMonth = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  let totalMonths = prolepticMonth(end) - prolepticMonth(start);
  let days = end.getUTCDate() - start.getUTCDate();

  if (totalMonths > 0 && days < 0) {
    totalMonths -= 1;
    const calcDate = plusMonths(start, totalMonths);
    days = epochDay(end) - epochDay(calcDate);
  } else if (totalMonths < 0 && days > 0) {
    totalMonths += 1;
    days -= daysInMonth(end.getUTCFullYear(), end.getUTCMonth());
  }

  return days;
}

function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// `rankSince` is nullable in the DB. The Java code has no null check and would throw
// (Period.between rejects null) - real data as of Phase 1 always has it populated, so this
// mirrors that by throwing too, rather than silently defaulting.
export function timeInHighestRankLabel(rankSince: Date | null, now: Date = new Date()): string {
  if (rankSince === null) {
    throw new Error('rankSince is null - backend Period.between(LocalDate.now(), null) would NPE here');
  }
  const days = periodDaysBetween(toUtcMidnight(now), toUtcMidnight(rankSince));
  return `${Math.abs(days)} day(s)`;
}
