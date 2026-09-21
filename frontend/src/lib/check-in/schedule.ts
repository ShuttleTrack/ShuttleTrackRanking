import { format, parseISO } from 'date-fns';
import type { GameDay, GameDayWeekday, SessionPhase } from './types';

const TIMEZONE = 'Europe/Amsterdam';

const SLOT_BY_WEEKDAY: Record<
  GameDayWeekday,
  { jsDay: number; slug: 'wed' | 'fri'; startTime: string; endTime: string; endHour: number; endMinute: number }
> = {
  WEDNESDAY: {
    jsDay: 3,
    slug: 'wed',
    startTime: '19:00',
    endTime: '22:00',
    endHour: 22,
    endMinute: 0,
  },
  FRIDAY: {
    jsDay: 5,
    slug: 'fri',
    startTime: '20:00',
    endTime: '23:00',
    endHour: 23,
    endMinute: 0,
  },
};

const WEEKDAY_ORDER: GameDayWeekday[] = ['WEDNESDAY', 'FRIDAY'];

interface AmsterdamWallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  jsDay: number;
}

function getAmsterdamWallClock(instant: Date): AmsterdamWallClock {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const jsDayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    jsDay: jsDayMap[weekdayShort] ?? 0,
  };
}

function isoDateFromParts(year: number, month: number, day: number): string {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addCalendarDays(year: number, month: number, day: number, days: number): string {
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return isoDateFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function isoDateToJsDay(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatGameDayId(weekday: GameDayWeekday, dateIso: string): string {
  const slug = SLOT_BY_WEEKDAY[weekday].slug;
  return `${slug}-${dateIso}`;
}

export function buildGameDay(weekday: GameDayWeekday, dateIso: string): GameDay {
  const slot = SLOT_BY_WEEKDAY[weekday];
  return {
    id: formatGameDayId(weekday, dateIso),
    weekday,
    date: dateIso,
    startTime: slot.startTime,
    endTime: slot.endTime,
    timezone: TIMEZONE,
  };
}

/** Current-or-next occurrence for one recurring slot (Amsterdam). */
export function relevantSessionDate(weekday: GameDayWeekday, now: Date): string {
  const slot = SLOT_BY_WEEKDAY[weekday];
  const clock = getAmsterdamWallClock(now);
  const todayIso = isoDateFromParts(clock.year, clock.month, clock.day);

  let daysUntil = (slot.jsDay - clock.jsDay + 7) % 7;

  if (daysUntil === 0) {
    const minutesNow = clock.hour * 60 + clock.minute;
    const endMinutes = slot.endHour * 60 + slot.endMinute;
    if (minutesNow < endMinutes) {
      return todayIso;
    }
    daysUntil = 7;
  }

  return addCalendarDays(clock.year, clock.month, clock.day, daysUntil);
}

export function upcomingSessions(now: Date): GameDay[] {
  return WEEKDAY_ORDER.map((weekday) => {
    const dateIso = relevantSessionDate(weekday, now);
    return buildGameDay(weekday, dateIso);
  });
}

/** Nearest upcoming session by calendar date and start time (e.g. Thursday → this Friday, not next Wednesday). */
export function nextUpcomingSession(now: Date): GameDay {
  const sessions = upcomingSessions(now);
  return [...sessions].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.startTime.localeCompare(b.startTime);
  })[0];
}

const UID_PATTERN = /^(wed|fri)-(\d{4}-\d{2}-\d{2})$/;

export function parseGameDayId(uid: string): GameDay | null {
  const match = UID_PATTERN.exec(uid.trim().toLowerCase());
  if (!match) return null;

  const slug = match[1];
  const dateIso = match[2];
  const weekday: GameDayWeekday = slug === 'wed' ? 'WEDNESDAY' : 'FRIDAY';

  if (Number.isNaN(parseISO(dateIso).getTime())) return null;

  if (isoDateToJsDay(dateIso) !== SLOT_BY_WEEKDAY[weekday].jsDay) return null;

  return buildGameDay(weekday, dateIso);
}

export function sessionPhase(gameDay: GameDay, now: Date): SessionPhase {
  const slot = SLOT_BY_WEEKDAY[gameDay.weekday];
  const clock = getAmsterdamWallClock(now);
  const todayIso = isoDateFromParts(clock.year, clock.month, clock.day);

  if (gameDay.date < todayIso) return 'ended';
  if (gameDay.date > todayIso) return 'upcoming';

  const minutesNow = clock.hour * 60 + clock.minute;
  const [startH, startM] = gameDay.startTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = slot.endHour * 60 + slot.endMinute;

  if (minutesNow < startMinutes) return 'upcoming';
  if (minutesNow >= endMinutes) return 'ended';
  return 'live';
}

export function formatSessionTitle(gameDay: GameDay): string {
  const parsed = parseISO(gameDay.date);
  const dayLabel = gameDay.weekday === 'WEDNESDAY' ? 'Wednesday' : 'Friday';
  const dateLabel = format(parsed, 'd MMM yyyy');
  return `${dayLabel} · ${dateLabel}`;
}

export function formatSessionTimeRange(gameDay: GameDay): string {
  return `${gameDay.startTime} – ${gameDay.endTime}`;
}

function calendarDaysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/** Human-readable countdown until session start (or status when live/ended). */
export function sessionStatusLabel(gameDay: GameDay, now: Date): string {
  const phase = sessionPhase(gameDay, now);
  if (phase === 'live') return 'Live now';
  if (phase === 'ended') return 'Ended';

  const clock = getAmsterdamWallClock(now);
  const todayIso = isoDateFromParts(clock.year, clock.month, clock.day);
  const [startH, startM] = gameDay.startTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const nowMinutes = clock.hour * 60 + clock.minute;

  let diffMinutes: number;
  if (gameDay.date === todayIso) {
    diffMinutes = startMinutes - nowMinutes;
  } else {
    const dayGap = calendarDaysBetween(todayIso, gameDay.date);
    diffMinutes = dayGap * 24 * 60 + startMinutes - nowMinutes;
  }

  if (diffMinutes <= 0) return 'Starting soon';

  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
}
