import { describe, it, expect } from 'vitest';
import { calculateGroupDistribution } from './game-planner';

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

describe('calculateGroupDistribution', () => {
  describe('size composition is fixed by player count', () => {
    for (const [countStr, expected] of Object.entries(EXPECTED_MULTISETS)) {
      const count = Number(countStr);
      it(`keeps the correct multiset for ${count} players regardless of seed`, () => {
        // Try a spread of seeds; the *set* of sizes must never change.
        for (const seed of ['a', 'b', '2026-06-04:' + count, 'zzz', '12345']) {
          const result = calculateGroupDistribution(count, seed);
          expect(sorted(result)).toEqual(expected);
          expect(result.reduce((s, n) => s + n, 0)).toBe(count);
          expect(result.every((n) => n === 4 || n === 5)).toBe(true);
        }
      });
    }
  });

  describe('determinism for a given seed (anti re-roll)', () => {
    it('returns an identical ordering for the same count + seed every call', () => {
      const seed = '2026-06-04:13';
      const first = calculateGroupDistribution(13, seed);
      for (let i = 0; i < 50; i++) {
        expect(calculateGroupDistribution(13, seed)).toEqual(first);
      }
    });

    it('does not depend on hidden global state (interleaved calls are stable)', () => {
      const a = calculateGroupDistribution(17, 'seed-A');
      calculateGroupDistribution(14, 'seed-X'); // unrelated call in between
      const aAgain = calculateGroupDistribution(17, 'seed-A');
      expect(aAgain).toEqual(a);
    });
  });

  describe('ordering actually varies across seeds (randomisation works)', () => {
    it('does not always place the 5-player group last for 13 players', () => {
      // Collect the index of the single "5" across many distinct seeds.
      const fiveIndexes = new Set<number>();
      for (let day = 1; day <= 60; day++) {
        const dist = calculateGroupDistribution(13, `2026-06-${day}:13`);
        fiveIndexes.add(dist.indexOf(5));
      }
      // With shuffling, the 5 should land in more than one position
      // (the old implementation always returned index 2).
      expect(fiveIndexes.size).toBeGreaterThan(1);
    });

    it('produces different orderings for different seeds on a mixed count', () => {
      const orderings = new Set<string>();
      for (let day = 1; day <= 60; day++) {
        orderings.add(calculateGroupDistribution(18, `2026-06-${day}:18`).join(','));
      }
      // [4,4,5,5] has several distinct arrangements; expect more than one.
      expect(orderings.size).toBeGreaterThan(1);
    });
  });

  describe('edge cases', () => {
    it('returns an empty distribution for fewer than 4 players', () => {
      expect(calculateGroupDistribution(0, 'seed')).toEqual([]);
      expect(calculateGroupDistribution(3, 'seed')).toEqual([]);
    });

    it('does not mutate across calls (no shared array reference leak)', () => {
      const a = calculateGroupDistribution(20, 'seed');
      a[0] = 99; // mutate the returned array
      const b = calculateGroupDistribution(20, 'seed');
      expect(b[0]).not.toBe(99);
    });
  });
});
