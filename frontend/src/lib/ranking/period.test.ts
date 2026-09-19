import { describe, it, expect } from 'vitest';
import { periodDaysBetween, timeInHighestRankLabel } from './period';

describe('period (ported java.time.Period.between(...).getDays() quirk)', () => {
  it('same month: matches simple day difference', () => {
    // 2026-09-19 -> 2026-09-02: 17 days apart, same month.
    expect(periodDaysBetween(new Date(Date.UTC(2026, 8, 19)), new Date(Date.UTC(2026, 8, 2)))).toBe(-17);
  });

  it('reproduces the real Phase 1 finding: crossing a month boundary understates elapsed days', () => {
    // Real player "navanji", rank_since 2026-08-17, captured "today" 2026-09-19 in this
    // session. 33 real elapsed days, but Period#getDays() only reports the day component (2).
    const start = new Date(Date.UTC(2026, 8, 19)); // 2026-09-19
    const end = new Date(Date.UTC(2026, 7, 17)); // 2026-08-17
    expect(periodDaysBetween(start, end)).toBe(-2);
    expect(Math.abs(periodDaysBetween(start, end))).not.toBe(33); // the "real" elapsed days
  });

  it('timeInHighestRankLabel reproduces "2 day(s)" for the navanji case, not "33 day(s)"', () => {
    const now = new Date(Date.UTC(2026, 8, 19));
    const rankSince = new Date(Date.UTC(2026, 7, 17));
    expect(timeInHighestRankLabel(rankSince, now)).toBe('2 day(s)');
  });

  it('throws on null rankSince, matching Period.between(..., null) NPE', () => {
    expect(() => timeInHighestRankLabel(null, new Date())).toThrow();
  });

  it('handles a month-length day-of-month clamp (Jan 31 -> Mar 3)', () => {
    // Mirrors LocalDate.until's plusMonths clamping semantics for edge-of-month dates.
    const start = new Date(Date.UTC(2026, 0, 31)); // 2026-01-31
    const end = new Date(Date.UTC(2026, 2, 3)); // 2026-03-03
    // totalMonths = 2, days = 3-31 = -28 (<0) -> totalMonths-- => 1, calcDate = Jan31+1mo = Feb28
    // days = epochDay(Mar3) - epochDay(Feb28) = 3
    expect(periodDaysBetween(start, end)).toBe(3);
  });
});
