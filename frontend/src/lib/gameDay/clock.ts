// Wall-clock <-> instant arithmetic for the game-day check-in (ATTENDANCE_VOTE_PLAN.md, "The
// clock"). Every threshold in the feature (09:00, 10:00, 13:00, start - 2h) is a wall-clock time
// in the squad's own zone that has to become an absolute instant, and `date-fns-tz` is not a
// dependency - this repo hand-rolls rather than adding one for a single job (see
// lib/telegram/sendEncounterPoll.ts). Intl.DateTimeFormat + formatToParts does the read
// direction; instantAt is its inverse.
//
// Pure: no Prisma, no env, no Date.now(). This is the only place in the codebase doing timezone
// arithmetic, and it is safe to import from client components too.

export const DEFAULT_TIMEZONE = 'Europe/Amsterdam';

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  jsDay: number; // 0 = Sunday, like Date.getUTCDay()
}

const WEEKDAY_TO_JS_DAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Formatters are comparatively expensive to build and the scheduler asks the same zone many
// times per tick.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      // h23, not hour12: false - the latter renders midnight as "24" in some ICU versions.
      hourCycle: 'h23',
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timezone: unknown): timezone is string {
  if (typeof timezone !== 'string' || timezone.length === 0 || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function wallClockIn(instant: Date, timezone: string): WallClock {
  const parts = formatterFor(timezone).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour') % 24,
    minute: pick('minute'),
    jsDay: WEEKDAY_TO_JS_DAY[weekday] ?? 0,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoDateFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

// The squad-local calendar date of an instant, as YYYY-MM-DD. "Today" for the scheduler is this,
// never the UTC date - at 00:30 in Amsterdam it is still yesterday in UTC.
export function localDateIso(instant: Date, timezone: string): string {
  const clock = wallClockIn(instant, timezone);
  return isoDateFromParts(clock.year, clock.month, clock.day);
}

// Calendar-day stepping on a date string. Never "add 24h to an instant", which breaks across a
// DST boundary.
export function addCalendarDays(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return isoDateFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

// The UTC-midnight Date this codebase uses for a date-only value (Prisma @db.Date, and the
// shape isPlayingDay expects).
export function dateOnlyFromIso(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

export function isoFromDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Wall-clock minutes-since-epoch, ignoring the zone - the quantity two instants are compared on
// to measure a zone's offset.
function wallClockAsUtcMs(clock: WallClock): number {
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);
}

// The instant at which `timezone`'s wall clock reads `time` on `dateIso`. Guess the instant as
// if the zone were UTC, measure the zone's actual offset at that guess, correct by it, and
// measure once more: the second pass settles the case where the correction itself crossed a DST
// transition. A wall time inside a spring-forward gap (02:30 on the last Sunday of March in
// Amsterdam) does not exist; it resolves to the instant one offset-difference later, which is
// what every wall clock would show anyway. None of this feature's fixed times fall in a gap.
export function instantAt(dateIso: string, time: string, timezone: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);

  const firstOffset = wallClockAsUtcMs(wallClockIn(new Date(target), timezone)) - target;
  let candidate = target - firstOffset;
  const secondOffset = wallClockAsUtcMs(wallClockIn(new Date(candidate), timezone)) - candidate;
  if (secondOffset !== firstOffset) {
    candidate = target - secondOffset;
  }
  return new Date(candidate);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}
