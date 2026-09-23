// The fixed clock of a game day (ATTENDANCE_VOTE_PLAN.md). Constants rather than per-squad
// settings, deliberately - these are club convention, not policy, and promoting them into
// gameDayOps later is purely additive (resolved open question 1). Pure, client-safe.
import { addMinutes, instantAt, localDateIso, wallClockIn } from './clock';

export const OPEN_SLOT_PING_TIME = '09:00';
export const REMINDER_TIME = '10:00';
export const VOTES_CLOSE_TIME = '13:00';
export const SLOT_LOCK_MINUTES_BEFORE_START = 120;

// The snapshot fields every clock question needs - satisfied by a Prisma GameDay row once its
// gameDate is rendered as YYYY-MM-DD, and by the API's wire shape.
export interface GameDayClock {
  gameDate: string; // YYYY-MM-DD, squad-local
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string;
}

export function resolveGameDayInstants(clock: GameDayClock): {
  votesCloseAt: Date;
  slotLockAt: Date;
  openSlotPingAt: Date;
  reminderAt: Date;
  sessionStartAt: Date;
  sessionEndAt: Date;
} {
  const sessionStartAt = instantAt(clock.gameDate, clock.startTime, clock.timezone);
  return {
    votesCloseAt: instantAt(clock.gameDate, VOTES_CLOSE_TIME, clock.timezone),
    slotLockAt: addMinutes(sessionStartAt, -SLOT_LOCK_MINUTES_BEFORE_START),
    openSlotPingAt: instantAt(clock.gameDate, OPEN_SLOT_PING_TIME, clock.timezone),
    reminderAt: instantAt(clock.gameDate, REMINDER_TIME, clock.timezone),
    sessionStartAt,
    sessionEndAt: instantAt(clock.gameDate, clock.endTime, clock.timezone),
  };
}

export type SessionPhase = 'upcoming' | 'live' | 'ended';

// The session's own phase - derived from the clock, never stored (Decision 4). Independent of
// the vote's VOTING_OPEN/VOTING_CLOSED status: a game day is VOTING_CLOSED from 13:00 and
// separately upcoming, then live, then ended as the evening passes.
export function sessionPhase(clock: GameDayClock, now: Date): SessionPhase {
  const { sessionStartAt, sessionEndAt } = resolveGameDayInstants(clock);
  if (now.getTime() < sessionStartAt.getTime()) return 'upcoming';
  if (now.getTime() >= sessionEndAt.getTime()) return 'ended';
  return 'live';
}

export function isToday(clock: GameDayClock, now: Date): boolean {
  return localDateIso(now, clock.timezone) === clock.gameDate;
}

// "Starts in 2d 4h" / "Live now" / "Ended". Measured in real elapsed time between instants, so a
// countdown across a DST change is right to the minute.
export function sessionStatusLabel(clock: GameDayClock, now: Date): string {
  const phase = sessionPhase(clock, now);
  if (phase === 'live') return 'Live now';
  if (phase === 'ended') return 'Ended';

  const diffMinutes = Math.floor(
    (resolveGameDayInstants(clock).sessionStartAt.getTime() - now.getTime()) / 60_000
  );
  if (diffMinutes <= 0) return 'Starting soon';
  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const minutes = diffMinutes % 60;
  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
}

// "HH:mm" of an instant in the game day's own zone - for rendering a stored instant (the
// deadline, the slot lock) the way the squad reads its clock.
export function localTimeOf(instant: Date, timezone: string): string {
  const clock = wallClockIn(instant, timezone);
  return `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
}
