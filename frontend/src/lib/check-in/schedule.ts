// Display helpers for a game day on the check-in pages. Rewritten from the mockup branch's
// version, which hardcoded Wednesday 19:00-22:00 / Friday 20:00-23:00 in Europe/Amsterdam: every
// time here now comes from the game day's own snapshot (startTime/endTime/timezone captured when
// it was created - ATTENDANCE_VOTE_PLAN.md), and the phase/countdown arithmetic is
// lib/gameDay/voteWindow.ts's, shared with the server.
import { format, parseISO } from 'date-fns';
import { localTimeOf, type GameDayClock } from '@/lib/gameDay/voteWindow';

export { sessionPhase, sessionStatusLabel, type SessionPhase } from '@/lib/gameDay/voteWindow';

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
