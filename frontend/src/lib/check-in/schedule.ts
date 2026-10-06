// Display helpers for a game day on the check-in pages. Rewritten from the mockup branch's
// version, which hardcoded Wednesday 19:00-22:00 / Friday 20:00-23:00 in Europe/Amsterdam: every
// time here now comes from the game day's own snapshot (startTime/endTime/timezone captured when
// it was created - ATTENDANCE_VOTE_PLAN.md), and the phase/countdown arithmetic is
// lib/gameDay/voteWindow.ts's, shared with the server.
import { format, parseISO } from 'date-fns';
import { DEFAULT_TIMEZONE, wallClockIn } from '@/lib/gameDay/clock';
import { localTimeOf, type GameDayClock } from '@/lib/gameDay/voteWindow';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export {
  durationUntilLabel,
  sessionPhase,
  sessionStatusLabel,
  type SessionPhase,
} from '@/lib/gameDay/voteWindow';

// "Wednesday · 23 Sep 2026"
export function formatSessionTitle(gameDay: Pick<GameDayClock, 'gameDate'>): string {
  const parsed = parseISO(gameDay.gameDate);
  return `${format(parsed, 'EEEE')} · ${format(parsed, 'd MMM yyyy')}`;
}

export function formatSessionTimeRange(gameDay: Pick<GameDayClock, 'startTime' | 'endTime'>): string {
  return `${gameDay.startTime} – ${gameDay.endTime}`;
}

// A stored instant (the voting deadline, the slot lock) as the squad reads its own clock.
export function formatLocalTime(isoInstant: string, timezone: string): string {
  return localTimeOf(new Date(isoInstant), timezone);
}

// "Europe/Amsterdam" → "Amsterdam" for display; full id stays on title/tooltip.
export function formatTimezoneCity(timezone: string): string {
  const segment = timezone.split('/').pop();
  if (!segment) return timezone;
  return segment.replace(/_/g, ' ');
}

// Check-in In/Out roster: when someone voted, always shown in Europe/Amsterdam (not the viewer's zone).
export function formatVoteTimeAmsterdam(isoInstant: string): string {
  const clock = wallClockIn(new Date(isoInstant), DEFAULT_TIMEZONE);
  const hh = String(clock.hour).padStart(2, '0');
  const mm = String(clock.minute).padStart(2, '0');
  return `${clock.day} ${SHORT_MONTHS[clock.month - 1]}, ${hh}:${mm}`;
}
