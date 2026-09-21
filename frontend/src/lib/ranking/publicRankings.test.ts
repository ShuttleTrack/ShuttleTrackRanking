import { describe, it, expect } from 'vitest';
import { buildPublicRankingsFromMemberships } from './publicRankings';
import type { RawEncounter } from '@/utils/playerForm';

function membership(
  overrides: Partial<{
    email: string;
    playerId: number;
    name: string;
    rankScore: number;
    playerRank: number;
    squadId: number;
    squadSlug: string;
    squadName: string;
  }> = {}
) {
  return {
    email: 'alice@example.com',
    playerId: 1,
    name: 'Alice',
    rankScore: 1000,
    playerRank: 1,
    squadId: 1,
    squadSlug: 'alpha',
    squadName: 'Alpha',
    ...overrides,
  };
}

describe('buildPublicRankingsFromMemberships', () => {
  it('sums rankScore for the same email across squads', () => {
    const rows = buildPublicRankingsFromMemberships(
      [
        membership({ playerId: 1, rankScore: 1100, squadId: 1, squadSlug: 'a', squadName: 'A' }),
        membership({
          email: 'alice@example.com',
          playerId: 2,
          rankScore: 900,
          playerRank: 2,
          squadId: 2,
          squadSlug: 'b',
          squadName: 'B',
        }),
      ],
      []
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].rankScore).toBe(2000);
    expect(rows[0].squads).toHaveLength(2);
    expect(rows[0].playerRank).toBe(1);
  });

  it('merges email case-insensitively', () => {
    const rows = buildPublicRankingsFromMemberships(
      [
        membership({ email: 'Alice@Example.com', rankScore: 500 }),
        membership({ email: 'alice@example.com', playerId: 2, rankScore: 300, squadId: 2 }),
      ],
      []
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].rankScore).toBe(800);
  });

  it('assigns display ranks by summed score descending', () => {
    const rows = buildPublicRankingsFromMemberships(
      [
        membership({ email: 'a@x.com', playerId: 1, name: 'A', rankScore: 100 }),
        membership({ email: 'b@x.com', playerId: 2, name: 'B', rankScore: 500 }),
        membership({ email: 'c@x.com', playerId: 3, name: 'C', rankScore: 300 }),
      ],
      []
    );
    expect(rows.map((r) => r.playerRank)).toEqual([1, 2, 3]);
    expect(rows[0].name).toBe('B');
    expect(rows[0].id).toBe(2);
  });

  it('picks primary membership by highest individual score', () => {
    const rows = buildPublicRankingsFromMemberships(
      [
        membership({
          email: 'bob@x.com',
          playerId: 10,
          name: 'BobLow',
          rankScore: 800,
          squadSlug: 'low',
          squadName: 'Low Squad',
        }),
        membership({
          email: 'bob@x.com',
          playerId: 11,
          name: 'BobHigh',
          rankScore: 1200,
          playerRank: 1,
          squadId: 2,
          squadSlug: 'high',
          squadName: 'High Squad',
        }),
      ],
      []
    );
    expect(rows[0].name).toBe('BobHigh');
    expect(rows[0].squadSlug).toBe('high');
    expect(rows[0].id).toBe(11);
  });

  it('combines form stats across player ids', () => {
    const encounters: RawEncounter[] = [
      {
        id: 1,
        team1: '1',
        team2: '99',
        encounterDate: '2026-01-01',
        processed: true,
        team1SetPoints: 2,
        team2SetPoints: 0,
      },
      {
        id: 2,
        team1: '2',
        team2: '98',
        encounterDate: '2026-01-02',
        processed: true,
        team1SetPoints: 0,
        team2SetPoints: 2,
      },
    ];
    const rows = buildPublicRankingsFromMemberships(
      [
        membership({ playerId: 1, email: 'p@x.com' }),
        membership({ playerId: 2, email: 'p@x.com', squadId: 2, squadSlug: 'b' }),
      ],
      encounters
    );
    expect(rows[0].lastFive).toEqual(['W', 'L']);
    expect(rows[0].winRate).toBe(50);
  });
});
