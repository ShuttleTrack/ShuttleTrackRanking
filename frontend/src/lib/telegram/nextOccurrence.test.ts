import { describe, it, expect } from 'vitest';
import { nextOccurrenceOf, dayNameOf } from './nextOccurrence';

describe('dayNameOf', () => {
  it('maps JS getUTCDay() correctly', () => {
    // 2026-09-14 is a Monday.
    expect(dayNameOf(new Date(Date.UTC(2026, 8, 14)))).toBe('MONDAY');
    expect(dayNameOf(new Date(Date.UTC(2026, 8, 16)))).toBe('WEDNESDAY');
    expect(dayNameOf(new Date(Date.UTC(2026, 8, 18)))).toBe('FRIDAY');
    expect(dayNameOf(new Date(Date.UTC(2026, 8, 20)))).toBe('SUNDAY');
  });
});

describe('nextOccurrenceOf (ported TemporalAdjusters.next(DayOfWeek))', () => {
  it('finds the next Wednesday from a Monday', () => {
    const monday = new Date(Date.UTC(2026, 8, 14)); // 2026-09-14 Monday
    expect(nextOccurrenceOf('WEDNESDAY', monday)).toEqual(new Date(Date.UTC(2026, 8, 16)));
  });

  it('finds the next Friday from a Wednesday', () => {
    const wednesday = new Date(Date.UTC(2026, 8, 16));
    expect(nextOccurrenceOf('FRIDAY', wednesday)).toEqual(new Date(Date.UTC(2026, 8, 18)));
  });

  it('never returns the same day, even when "from" already matches the target', () => {
    const wednesday = new Date(Date.UTC(2026, 8, 16));
    // Next Wednesday from a Wednesday should be 7 days later, not today.
    expect(nextOccurrenceOf('WEDNESDAY', wednesday)).toEqual(new Date(Date.UTC(2026, 8, 23)));
  });

  it('wraps across a month boundary', () => {
    // 2026-09-28 is a Monday; next Friday should be 2026-10-02.
    const monday = new Date(Date.UTC(2026, 8, 28));
    expect(nextOccurrenceOf('FRIDAY', monday)).toEqual(new Date(Date.UTC(2026, 9, 2)));
  });
});
