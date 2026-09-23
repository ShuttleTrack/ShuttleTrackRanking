import { describe, it, expect } from 'vitest';
import { formatLocalTime, formatSessionTimeRange, formatSessionTitle } from './schedule';

describe('check-in display helpers', () => {
  it('titles a session by its own date', () => {
    expect(formatSessionTitle({ gameDate: '2026-09-23' })).toBe('Wednesday · 23 Sep 2026');
    expect(formatSessionTitle({ gameDate: '2026-09-25' })).toBe('Friday · 25 Sep 2026');
  });

  it("shows the snapshot's own times, whatever the weekday", () => {
    expect(formatSessionTimeRange({ startTime: '20:00', endTime: '23:00' })).toBe('20:00 – 23:00');
  });

  it("renders a stored instant in the game day's zone, not the viewer's", () => {
    expect(formatLocalTime('2026-09-23T11:00:00.000Z', 'Europe/Amsterdam')).toBe('13:00');
    expect(formatLocalTime('2026-09-23T11:00:00.000Z', 'Asia/Colombo')).toBe('16:30');
  });
});
