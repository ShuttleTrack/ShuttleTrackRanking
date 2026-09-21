import { describe, it, expect } from 'vitest';
import { getRankedPlayers, type RankablePlayer } from './playerUtil';

describe('getRankedPlayers null-safety (OPEN_SLOT_PLAYERS_PLAN.md)', () => {
  it('matches pre-existing behavior when no player has a null rankScore', () => {
    const players: RankablePlayer[] = [
      { rankScore: 900, playerRank: 3 },
      { rankScore: 1100, playerRank: 1 },
      { rankScore: 1000, playerRank: 2 },
    ];
    const ranked = getRankedPlayers(players);
    expect(ranked.map((p) => p.rankScore)).toEqual([1100, 1000, 900]);
  });

  it('preserves the playerRank tiebreak order on a rankScore tie', () => {
    const players: RankablePlayer[] = [
      { rankScore: 1000, playerRank: 2 },
      { rankScore: 1000, playerRank: 1 },
    ];
    const ranked = getRankedPlayers(players);
    expect(ranked.map((p) => p.playerRank)).toEqual([1, 2]);
  });

  it('sorts a scoreless (null rankScore) player last', () => {
    const players: RankablePlayer[] = [
      { rankScore: null, playerRank: 0 },
      { rankScore: 1000, playerRank: 1 },
      { rankScore: 900, playerRank: 2 },
    ];
    const ranked = getRankedPlayers(players);
    expect(ranked.map((p) => p.rankScore)).toEqual([1000, 900, null]);
  });

  it('does not destabilize the sort when two players are both scoreless', () => {
    const players: RankablePlayer[] = [
      { rankScore: 1000, playerRank: 1 },
      { rankScore: null, playerRank: 0 },
      { rankScore: null, playerRank: 0 },
    ];
    const ranked = getRankedPlayers(players);
    expect(ranked[0].rankScore).toBe(1000);
    expect(ranked.slice(1).every((p) => p.rankScore === null)).toBe(true);
    expect(ranked).toHaveLength(3);
  });
});
