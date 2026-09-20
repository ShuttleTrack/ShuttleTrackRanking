import { describe, expect, it } from 'vitest';
import {
  buildPlayerRankSeries,
  buildRankChangeRows,
  chartYDomain,
  resolveDefaultPlayerId,
  syntheticPaddingDate,
} from './rankHistory';
import type { RankingHistoryData } from '@/types/rankings';

const sampleHistory: RankingHistoryData[] = [
  { date: '2024-01-01', Alice: 3, Bob: 1 },
  { date: '2024-01-08', Alice: 2, Bob: 1 },
  { date: '2024-01-15', Alice: 1, Bob: 2 },
];

describe('syntheticPaddingDate', () => {
  it('returns earliest date', () => {
    expect(syntheticPaddingDate(sampleHistory)).toBe('2024-01-01');
  });
});

describe('buildPlayerRankSeries', () => {
  it('returns rank points in chronological order', () => {
    expect(buildPlayerRankSeries(sampleHistory, 'Alice')).toEqual([
      { date: '2024-01-01', rank: 3 },
      { date: '2024-01-08', rank: 2 },
      { date: '2024-01-15', rank: 1 },
    ]);
  });
});

describe('buildRankChangeRows', () => {
  it('skips padding date and sorts newest first with rank deltas', () => {
    const rows = buildRankChangeRows(sampleHistory, 'Alice');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: '2024-01-15',
      oldRank: 2,
      newRank: 1,
      rankChange: { direction: 'up', amount: 1 },
    });
    expect(rows[1]).toMatchObject({
      date: '2024-01-08',
      oldRank: 3,
      newRank: 2,
      rankChange: { direction: 'up', amount: 1 },
    });
  });
});

describe('resolveDefaultPlayerId', () => {
  const players = [
    { id: 10, playerRank: 2 },
    { id: 20, playerRank: 1 },
    { id: 30, playerRank: 0 },
  ];

  it('prefers query player when valid', () => {
    expect(resolveDefaultPlayerId(players, { queryPlayerId: 10 })).toBe(10);
  });

  it('falls back to session player', () => {
    expect(resolveDefaultPlayerId(players, { sessionPlayerId: 10 })).toBe(10);
  });

  it('defaults to rank 1', () => {
    expect(resolveDefaultPlayerId(players)).toBe(20);
  });
});

describe('chartYDomain', () => {
  it('pads rank range', () => {
    const [min, max] = chartYDomain([3, 1, 2]);
    expect(min).toBeLessThanOrEqual(1);
    expect(max).toBeGreaterThanOrEqual(3);
  });
});
