// Timezone choices for the squad schedule's `timezone` field (ATTENDANCE_VOTE_PLAN.md,
// Decision 3). The browser knows ~400 IANA zones - far too many for a plain <select> - so the
// settings page uses a searchable picker over these helpers. Pure and client-safe; the offset
// arithmetic is lib/gameDay/clock.ts's, so the picker shows exactly what the scheduler will use.
import { DEFAULT_TIMEZONE, wallClockIn } from '@/lib/gameDay/clock';

// Shown before anything is typed. The club's own zone first, then the ones a friend-group squad
// here is realistically in; everything else is one search away.
export const COMMON_TIMEZONES = [
  DEFAULT_TIMEZONE,
  'Europe/Brussels',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/London',
  'Asia/Colombo',
  'UTC',
];

// Used when the runtime cannot enumerate zones (Intl.supportedValuesOf is recent).
const FALLBACK_TIMEZONES = [
  ...COMMON_TIMEZONES,
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Zurich',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
];

export function allTimezones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
  const zones = supported?.length ? supported : FALLBACK_TIMEZONES;
  // Some engines leave UTC out of supportedValuesOf.
  return Array.from(new Set([...zones, 'UTC'])).sort();
}

// "UTC+02:00" - the zone's offset at `now` (so it reflects DST as it is today).
export function utcOffsetLabel(timezone: string, now: Date): string {
  try {
    const clock = wallClockIn(now, timezone);
    const wallAsUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);
    const offsetMinutes = Math.round((wallAsUtc - Math.floor(now.getTime() / 60_000) * 60_000) / 60_000);
    const sign = offsetMinutes < 0 ? '-' : '+';
    const abs = Math.abs(offsetMinutes);
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export interface TimezoneOption {
  zone: string; // IANA id - what is stored
  city: string; // "Amsterdam", "Sao Paulo", "Buenos Aires"
  region: string; // "Europe", "America/Argentina"
  offset: string; // "UTC+02:00"
}

export function toTimezoneOption(zone: string, now: Date): TimezoneOption {
  const parts = zone.split('/');
  return {
    zone,
    city: parts[parts.length - 1].replace(/_/g, ' '),
    region: parts.slice(0, -1).join('/').replace(/_/g, ' '),
    offset: utcOffsetLabel(zone, now),
  };
}

// Normalise for matching: lower-case, underscores and slashes as spaces, accents stripped.
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_/]/g, ' ')
    .trim();
}

// Every whitespace-separated term must match somewhere in the zone id or its offset, so
// "europe ams", "amsterdam", "sao paulo", "utc+05:30" and "+05:30" all work. Ranked: city starts
// with the query, then zone id starts with it, then anywhere - alphabetical within each rank.
export function searchTimezones(query: string, options: TimezoneOption[], limit = 50): TimezoneOption[] {
  const q = normalise(query);
  if (!q) return options.slice(0, limit);
  const terms = q.split(/\s+/);

  const scored: { option: TimezoneOption; rank: number }[] = [];
  for (const option of options) {
    const haystack = `${normalise(option.zone)} ${option.offset.toLowerCase()}`;
    if (!terms.every((t) => haystack.includes(t))) continue;
    const city = normalise(option.city);
    const rank = city.startsWith(q) ? 0 : normalise(option.zone).startsWith(q) ? 1 : 2;
    scored.push({ option, rank });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.option.zone.localeCompare(b.option.zone))
    .slice(0, limit)
    .map((s) => s.option);
}
