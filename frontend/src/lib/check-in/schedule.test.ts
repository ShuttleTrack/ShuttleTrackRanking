import { describe, it, expect } from 'vitest';
import {
  buildGameDay,
  formatGameDayId,
  parseGameDayId,
  relevantSessionDate,
  sessionPhase,
  nextUpcomingSession,
  upcomingSessions,
} from './schedule';

/** 2026-09-16 19:30 in Europe/Amsterdam (CEST, UTC+2). */
const WED_EVENING_AMS = new Date('2026-09-16T17:30:00.000Z');

/** 2026-09-16 22:30 in Europe/Amsterdam. */
const WED_AFTER_END_AMS = new Date('2026-09-16T20:30:00.000Z');

/** 2026-09-15 12:00 in Europe/Amsterdam (Tuesday). */
const TUE_NOON_AMS = new Date('2026-09-15T10:00:00.000Z');

/** 2026-09-17 12:00 in Europe/Amsterdam (Thursday). */
const THU_NOON_AMS = new Date('2026-09-17T10:00:00.000Z');

describe('formatGameDayId / parseGameDayId', () => {
  it('round-trips Wednesday and Friday ids', () => {
    const wed = buildGameDay('WEDNESDAY', '2026-09-23');
    expect(wed.id).toBe('wed-2026-09-23');
    expect(parseGameDayId('wed-2026-09-23')).toEqual(wed);

    const fri = buildGameDay('FRIDAY', '2026-09-25');
    expect(formatGameDayId('FRIDAY', '2026-09-25')).toBe('fri-2026-09-25');
    expect(parseGameDayId('fri-2026-09-25')).toEqual(fri);
  });

  it('rejects mismatched weekday and date', () => {
    expect(parseGameDayId('wed-2026-09-25')).toBeNull();
    expect(parseGameDayId('not-valid')).toBeNull();
  });
});

describe('relevantSessionDate', () => {
  it('uses this Wednesday when session has not ended', () => {
    expect(relevantSessionDate('WEDNESDAY', WED_EVENING_AMS)).toBe('2026-09-16');
  });

  it('uses next Wednesday after session end time', () => {
    expect(relevantSessionDate('WEDNESDAY', WED_AFTER_END_AMS)).toBe('2026-09-23');
  });

  it('uses upcoming Wednesday from Tuesday', () => {
    expect(relevantSessionDate('WEDNESDAY', TUE_NOON_AMS)).toBe('2026-09-16');
  });
});

describe('sessionPhase', () => {
  it('marks live during slot hours', () => {
    const day = buildGameDay('WEDNESDAY', '2026-09-16');
    expect(sessionPhase(day, WED_EVENING_AMS)).toBe('live');
  });

  it('marks ended after slot', () => {
    const day = buildGameDay('WEDNESDAY', '2026-09-16');
    expect(sessionPhase(day, WED_AFTER_END_AMS)).toBe('ended');
  });
});

describe('upcomingSessions', () => {
  it('returns Wednesday and Friday slots', () => {
    const sessions = upcomingSessions(TUE_NOON_AMS);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].weekday).toBe('WEDNESDAY');
    expect(sessions[1].weekday).toBe('FRIDAY');
    expect(sessions[0].startTime).toBe('19:00');
    expect(sessions[1].startTime).toBe('20:00');
  });
});

describe('nextUpcomingSession', () => {
  it('picks the nearer Wednesday from Tuesday', () => {
    const next = nextUpcomingSession(TUE_NOON_AMS);
    expect(next.weekday).toBe('WEDNESDAY');
    expect(next.date).toBe('2026-09-16');
  });

  it('picks Friday over next Wednesday from Thursday', () => {
    const next = nextUpcomingSession(THU_NOON_AMS);
    expect(next.weekday).toBe('FRIDAY');
    expect(next.date).toBe('2026-09-18');
  });
});
