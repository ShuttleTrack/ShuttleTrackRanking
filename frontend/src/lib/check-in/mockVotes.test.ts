import { describe, it, expect } from 'vitest';
import type { Player } from '@/types/player';
import { buildCheckInRoster } from './mockVotes';

const players: Player[] = [
  {
    id: 1,
    name: 'alpha',
    rankScore: 1100,
    playerRank: 1,
    previousRank: 1,
    colorHex: 'ff0000',
    highestRank: 1,
    timeInHighestRank: '1d',
    active: true,
  },
  {
    id: 2,
    name: 'bravo',
    rankScore: 1050,
    playerRank: 2,
    previousRank: 2,
    colorHex: '00ff00',
    highestRank: 2,
    timeInHighestRank: '2d',
    active: true,
  },
  {
    id: 3,
    name: 'charlie',
    rankScore: 1000,
    playerRank: 3,
    previousRank: 3,
    colorHex: '0000ff',
    highestRank: 3,
    timeInHighestRank: '3d',
    active: true,
  },
];

describe('buildCheckInRoster', () => {
  it('returns empty lists until the user has voted', () => {
    const roster = buildCheckInRoster(players, 'wed-2026-09-23', 1, null);
    expect(roster.inPlayers).toHaveLength(0);
    expect(roster.outPlayers).toHaveLength(0);
  });

  it('places the current user according to myVote', () => {
    const inRoster = buildCheckInRoster(players, 'wed-2026-09-23', 1, 'IN');
    expect(inRoster.inPlayers.some((p) => p.id === 1)).toBe(true);
    expect(inRoster.outPlayers.some((p) => p.id === 1)).toBe(false);

    const outRoster = buildCheckInRoster(players, 'wed-2026-09-23', 1, 'OUT');
    expect(outRoster.outPlayers.some((p) => p.id === 1)).toBe(true);
    expect(outRoster.inPlayers.some((p) => p.id === 1)).toBe(false);
  });

  it('splits other players deterministically for a given uid', () => {
    const first = buildCheckInRoster(players, 'wed-2026-09-23', 1, 'IN');
    const second = buildCheckInRoster(players, 'wed-2026-09-23', 1, 'IN');
    expect(first.inPlayers.map((p) => p.id)).toEqual(second.inPlayers.map((p) => p.id));
    expect(first.outPlayers.map((p) => p.id)).toEqual(second.outPlayers.map((p) => p.id));
  });

  it('includes uid in deterministic vote for other players', () => {
    const side = (uid: string, id: number) => {
      const roster = buildCheckInRoster(players, uid, 1, 'IN');
      return roster.inPlayers.some((p) => p.id === id) ? 'IN' : 'OUT';
    };
    expect(side('wed-2026-09-23', 2)).not.toBe(side('fri-2026-09-18', 2));
  });
});
