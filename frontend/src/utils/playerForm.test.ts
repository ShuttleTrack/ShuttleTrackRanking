import { describe, expect, it } from 'vitest';
import { computePlayerFormStats, type RawEncounter } from './playerForm';

const base = (overrides: Partial<RawEncounter>): RawEncounter => ({
  team1: '1:2',
  team2: '3:4',
  encounterDate: '2024-01-01',
  processed: true,
  team1SetPoints: 21,
  team2SetPoints: 15,
  ...overrides,
});

describe('computePlayerFormStats', () => {
  it('returns empty form and zero win rate when player has no encounters', () => {
    const stats = computePlayerFormStats(99, [base({})]);
    expect(stats.lastFive).toEqual([]);
    expect(stats.winRate).toBe(0);
    expect(stats.totalGames).toBe(0);
  });

  it('computes win rate and last five in chronological order', () => {
    const encounters: RawEncounter[] = [
      base({ id: 1, encounterDate: '2024-01-01', team1: '1:2', team2: '3:4', team1SetPoints: 10, team2SetPoints: 21 }),
      base({ id: 2, encounterDate: '2024-01-08', team1: '1:5', team2: '3:4', team1SetPoints: 21, team2SetPoints: 18 }),
      base({ id: 3, encounterDate: '2024-01-15', team1: '1:2', team2: '5:6', team1SetPoints: 21, team2SetPoints: 19 }),
      base({ id: 4, encounterDate: '2024-01-22', team1: '7:8', team2: '1:2', team1SetPoints: 21, team2SetPoints: 12 }),
      base({ id: 5, encounterDate: '2024-01-29', team1: '1:2', team2: '3:4', team1SetPoints: 21, team2SetPoints: 10 }),
      base({ id: 6, encounterDate: '2024-02-05', team1: '1:2', team2: '5:6', team1SetPoints: 15, team2SetPoints: 21 }),
    ];

    const stats = computePlayerFormStats(1, encounters);
    expect(stats.totalGames).toBe(6);
    expect(stats.winRate).toBeCloseTo(50);
    expect(stats.lastFive).toEqual(['W', 'W', 'L', 'W', 'L']);
  });

  it('ignores unprocessed encounters', () => {
    const encounters = [
      base({ processed: false, team1: '1:2', team1SetPoints: 21, team2SetPoints: 0 }),
    ];
    expect(computePlayerFormStats(1, encounters).totalGames).toBe(0);
  });
});
