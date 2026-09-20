import { describe, expect, it } from 'vitest';
import { parsePeakTenureDays, peakTenureCopy } from './PeakTenure';

describe('parsePeakTenureDays', () => {
  it('parses leading integer from API day(s) string', () => {
    expect(parsePeakTenureDays('18 day(s)')).toBe(18);
    expect(parsePeakTenureDays('0 day(s)')).toBe(0);
  });

  it('returns null for empty or non-numeric strings', () => {
    expect(parsePeakTenureDays('')).toBe(null);
    expect(parsePeakTenureDays('   ')).toBe(null);
  });
});

describe('peakTenureCopy', () => {
  it('at peak with tenure shows days at peak', () => {
    expect(
      peakTenureCopy({ playerRank: 1, highestRank: 1, timeInHighestRank: '18 day(s)' }),
    ).toEqual({
      label: '18d at peak',
      ariaLabel: 'At peak for 18 days',
    });
  });

  it('at peak with zero days shows new peak', () => {
    expect(
      peakTenureCopy({ playerRank: 5, highestRank: 5, timeInHighestRank: '0 day(s)' }),
    ).toEqual({
      label: 'New peak',
      ariaLabel: 'New personal best rank',
    });
  });

  it('at peak without duration shows at peak', () => {
    expect(
      peakTenureCopy({ playerRank: 2, highestRank: 2, timeInHighestRank: '' }),
    ).toEqual({
      label: 'At peak',
      ariaLabel: 'Currently at personal best rank',
    });
  });

  it('off peak shows peak rank and days', () => {
    expect(
      peakTenureCopy({ playerRank: 7, highestRank: 3, timeInHighestRank: '4 day(s)' }),
    ).toEqual({
      label: 'Peak #3 · 4d',
      ariaLabel: 'Best rank 3, held for 4 days',
    });
  });

  it('off peak without duration shows peak rank only', () => {
    expect(
      peakTenureCopy({ playerRank: 10, highestRank: 4, timeInHighestRank: '' }),
    ).toEqual({
      label: 'Peak #4',
      ariaLabel: 'Best rank 4',
    });
  });

  it('uses singular day in aria label when tenure is one day', () => {
    expect(
      peakTenureCopy({ playerRank: 1, highestRank: 1, timeInHighestRank: '1 day(s)' }),
    ).toEqual({
      label: '1d at peak',
      ariaLabel: 'At peak for 1 day',
    });
  });
});
