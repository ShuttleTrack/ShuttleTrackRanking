import { describe, it, expect } from 'vitest';
import type { SquadScheduleData } from '@/lib/squadSchedule';
import { isPlayingDay, countPlayingDaysBetween, getPlayingDatesInRange } from './playingDayCalculator';

function schedule(overrides: Partial<SquadScheduleData> = {}): SquadScheduleData {
  return {
    isRecurring: true,
    dayOfWeek: 'WEDNESDAY',
    startTime: '19:00',
    endTime: '21:00',
    startDate: '2026-01-01',
    endDate: null,
    skipDates: [],
    ...overrides,
  };
}

function d(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

describe('isPlayingDay', () => {
  it('matches the configured day of week', () => {
    expect(isPlayingDay(schedule(), d('2026-09-23'))).toBe(true); // a Wednesday
    expect(isPlayingDay(schedule(), d('2026-09-24'))).toBe(false); // Thursday
  });

  it('false when not recurring', () => {
    expect(isPlayingDay(schedule({ isRecurring: false }), d('2026-09-23'))).toBe(false);
  });

  it('false when dayOfWeek is null', () => {
    expect(isPlayingDay(schedule({ dayOfWeek: null }), d('2026-09-23'))).toBe(false);
  });

  it('respects startDate/endDate bounds', () => {
    const s = schedule({ startDate: '2026-09-23', endDate: '2026-09-23' });
    expect(isPlayingDay(s, d('2026-09-16'))).toBe(false); // before start
    expect(isPlayingDay(s, d('2026-09-23'))).toBe(true); // on start
    expect(isPlayingDay(s, d('2026-09-30'))).toBe(false); // after end
  });

  it('respects skipDates', () => {
    const s = schedule({ skipDates: ['2026-09-23'] });
    expect(isPlayingDay(s, d('2026-09-23'))).toBe(false);
    expect(isPlayingDay(s, d('2026-09-30'))).toBe(true);
  });
});

describe('countPlayingDaysBetween', () => {
  it('counts weekly recurrence across a range, exclusive of fromExclusive', () => {
    // Wednesdays: 9/23, 9/30, 10/7, 10/14 - from the day before 9/23 through 10/14 inclusive.
    const count = countPlayingDaysBetween(schedule(), d('2026-09-22'), d('2026-10-14'));
    expect(count).toBe(4);
  });

  it('excludes the fromExclusive date itself even if it is a playing day', () => {
    const count = countPlayingDaysBetween(schedule(), d('2026-09-23'), d('2026-09-23'));
    expect(count).toBe(0);
  });

  it('includes toInclusive when it is a playing day', () => {
    const count = countPlayingDaysBetween(schedule(), d('2026-09-22'), d('2026-09-23'));
    expect(count).toBe(1);
  });

  it('subtracts skipped dates from the count', () => {
    const s = schedule({ skipDates: ['2026-09-30'] });
    const count = countPlayingDaysBetween(s, d('2026-09-22'), d('2026-10-14'));
    expect(count).toBe(3);
  });

  it('returns 0 for a non-recurring schedule', () => {
    const count = countPlayingDaysBetween(schedule({ isRecurring: false }), d('2026-09-22'), d('2026-10-14'));
    expect(count).toBe(0);
  });
});

describe('getPlayingDatesInRange', () => {
  it('returns every matching date inclusive of both endpoints', () => {
    const dates = getPlayingDatesInRange(schedule(), d('2026-09-23'), d('2026-10-07'));
    expect(dates.map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-09-23', '2026-09-30', '2026-10-07']);
  });
});
