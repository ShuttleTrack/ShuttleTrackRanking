import { describe, it, expect } from 'vitest';
import { calculateGroupDistribution } from '@/pages/s/[squad]/admin/game-planner';

// Expected size composition (order-independent) for every supported count.
const EXPECTED_MULTISETS: Record<number, number[]> = {
  4: [4],
  5: [5],
  8: [4, 4],
  9: [4, 5],
  10: [5, 5],
  12: [4, 4, 4],
  13: [4, 4, 5],
  14: [4, 5, 5],
  15: [5, 5, 5],
  16: [4, 4, 4, 4],
  17: [4, 4, 4, 5],
  18: [4, 4, 5, 5],
  19: [4, 5, 5, 5],
  20: [5, 5, 5, 5],
};

const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);

// Always picks the same value; lets tests pin down the shuffle's result.
const constantRng = (value: number) => () => value;

describe('calculateGroupDistribution', () => {
  describe('size composition is fixed by player count', () => {
    for (const [countStr, expected] of Object.entries(EXPECTED_MULTISETS)) {
      const count = Number(countStr);
      it(`keeps the correct multiset for ${count} players regardless of shuffle`, () => {
        // Try a spread of shuffles; the *set* of sizes must never change.
        for (let i = 0; i < 20; i++) {
          const result = calculateGroupDistribution(count);
          expect(sorted(result)).toEqual(expected);
          expect(result.reduce((s, n) => s + n, 0)).toBe(count);
          expect(result.every((n) => n === 4 || n === 5)).toBe(true);
        }
      });
    }
  });

  describe('ordering is randomised', () => {
    it('does not always place the 5-player group last for 13 players', () => {
      const fiveIndexes = new Set<number>();
      for (let i = 0; i < 200; i++) {
        fiveIndexes.add(calculateGroupDistribution(13).indexOf(5));
      }
      // With shuffling, the 5 should land in more than one position
      // (the original implementation always returned index 2).
      expect(fiveIndexes.size).toBeGreaterThan(1);
    });

    it('produces different orderings across calls on a mixed count', () => {
      const orderings = new Set<string>();
      for (let i = 0; i < 200; i++) {
        orderings.add(calculateGroupDistribution(18).join(','));
      }
      // [4,4,5,5] has several distinct arrangements; expect more than one.
      expect(orderings.size).toBeGreaterThan(1);
    });

    it('uses the injected rng', () => {
      // rng always 0 => every Fisher-Yates step swaps with index 0.
      expect(calculateGroupDistribution(13, constantRng(0))).toEqual([4, 5, 4]);
      // rng just under 1 => every step swaps with itself (no-op).
      expect(calculateGroupDistribution(13, constantRng(0.999))).toEqual([4, 4, 5]);
    });
  });

  describe('edge cases', () => {
    it('returns an empty distribution for fewer than 4 players', () => {
      expect(calculateGroupDistribution(0)).toEqual([]);
      expect(calculateGroupDistribution(3)).toEqual([]);
    });

    it('does not mutate across calls (no shared array reference leak)', () => {
      const a = calculateGroupDistribution(20);
      a[0] = 99; // mutate the returned array
      const b = calculateGroupDistribution(20);
      expect(b[0]).not.toBe(99);
    });
  });
});
