import { describe, it, expect } from 'vitest';
import type { Player as PrismaPlayer, ScoreHistory as PrismaScoreHistory } from '@prisma/client';
import { toPlayerInfo, toSecurePlayerInfo, buildPlayerHistory, toRawPlayerJson } from './players';

function player(overrides: Partial<PrismaPlayer> = {}): PrismaPlayer {
  return {
    id: 1,
    squadId: 1,
    name: 'chathura',
    rankScore: 858.48,
    playerRank: 1,
    highestRank: 1,
    rankSince: new Date(Date.UTC(2026, 8, 2)),
    colorHex: '800000',
    disabled: false,
    email: 'chathura@example.com',
    playerStatus: 'ACTIVE',
    ...overrides,
  };
}

function scoreHistory(overrides: Partial<PrismaScoreHistory> = {}): PrismaScoreHistory {
  return {
    id: 1,
    playerId: 1,
    encounterId: 1,
    oldRankScore: 800,
    newRankScore: 810,
    mysqlInsertedTimestamp: new Date(),
    playerOldRank: 2,
    playerNewRank: 1,
    encounterDate: new Date(Date.UTC(2026, 8, 2)),
    ...overrides,
  };
}

describe('toPlayerInfo (ported PlayerService.getPlayerInfoByStatus mapping)', () => {
  it('active player exposes rankScore/playerRank; previousRank from most recent history', () => {
    const info = toPlayerInfo(player(), scoreHistory({ playerOldRank: 5 }));
    expect(info.rankScore).toBe(858.48);
    expect(info.playerRank).toBe(1);
    expect(info.previousRank).toBe(5);
    expect(info.status).toBe('ACTIVE');
  });

  it('inactive (ENABLED) player has null rankScore/playerRank despite having values in the DB', () => {
    const info = toPlayerInfo(player({ playerStatus: 'ENABLED' }), null);
    expect(info.rankScore).toBeNull();
    expect(info.playerRank).toBeNull();
    expect(info.status).toBe('ENABLED');
  });

  it('falls back to the player\'s current playerRank as previousRank when there is no score history (getMaxRank)', () => {
    const info = toPlayerInfo(player({ playerRank: 7 }), null);
    expect(info.previousRank).toBe(7);
  });

  it('toSecurePlayerInfo adds email on top of PlayerInfo', () => {
    const info = toSecurePlayerInfo(player({ email: 'x@y.com' }), null);
    expect(info.email).toBe('x@y.com');
    expect(info.name).toBe('chathura');
  });
});

describe('buildPlayerHistory (ported ScoreHistoryService.getPlayerHistory)', () => {
  it('RANK: dedupes identical (date, oldRank, newRank) tuples and sorts by date ascending', () => {
    const rows = [
      scoreHistory({ encounterId: 2, encounterDate: new Date(Date.UTC(2026, 8, 5)), playerOldRank: 3, playerNewRank: 2 }),
      scoreHistory({ encounterId: 1, encounterDate: new Date(Date.UTC(2026, 8, 2)), playerOldRank: 4, playerNewRank: 3 }),
      // Duplicate of the first tuple from a different encounter on the same day - collapses.
      scoreHistory({ encounterId: 3, encounterDate: new Date(Date.UTC(2026, 8, 5)), playerOldRank: 3, playerNewRank: 2 }),
    ];
    const result = buildPlayerHistory('chathura', 1, rows, 'RANK');
    expect(result.history).toEqual([
      { date: '2026-09-02', oldRank: 4, newRank: 3 },
      { date: '2026-09-05', oldRank: 3, newRank: 2 },
    ]);
  });

  it('SCORE: sorts by encounterId ascending', () => {
    const rows = [
      scoreHistory({ encounterId: 5, oldRankScore: 700, newRankScore: 710 }),
      scoreHistory({ encounterId: 2, oldRankScore: 800, newRankScore: 810 }),
    ];
    const result = buildPlayerHistory('chathura', 1, rows, 'SCORE');
    expect(result.history.map((h) => (h as { encounterId: number }).encounterId)).toEqual([2, 5]);
  });

  it('ALL: includes both rank and score fields, sorted by encounterId', () => {
    const rows = [scoreHistory({ encounterId: 9, playerOldRank: 2, playerNewRank: 1 })];
    const result = buildPlayerHistory('chathura', 1, rows, 'ALL');
    expect(result.history[0]).toMatchObject({
      encounterId: 9,
      oldRank: 2,
      newRank: 1,
      oldRankScore: 800,
      newRankScore: 810,
    });
  });
});

describe('toRawPlayerJson (ported raw Player entity shape, incl. Jackson boolean-getter fields)', () => {
  it('ACTIVE player: active=true, disabled=false, availableForGame=true', () => {
    const json = toRawPlayerJson(player({ playerStatus: 'ACTIVE' }));
    expect(json).toMatchObject({ active: true, disabled: false, availableForGame: true, status: 'ACTIVE' });
  });

  it('DISABLED player: active=false, disabled=true, availableForGame=false', () => {
    const json = toRawPlayerJson(player({ playerStatus: 'DISABLED' }));
    expect(json).toMatchObject({ active: false, disabled: true, availableForGame: false, status: 'DISABLED' });
  });

  it('null status behaves like ENABLED: not active, not disabled, available', () => {
    const json = toRawPlayerJson(player({ playerStatus: null }));
    expect(json).toMatchObject({ active: false, disabled: false, availableForGame: true, status: null });
  });

  it('rankSince serializes as a yyyy-MM-dd string, or null if unset', () => {
    expect(toRawPlayerJson(player({ rankSince: new Date(Date.UTC(2026, 8, 2)) })).rankSince).toBe('2026-09-02');
    expect(toRawPlayerJson(player({ rankSince: null })).rankSince).toBeNull();
  });
});
