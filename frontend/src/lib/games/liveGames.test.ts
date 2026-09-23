import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const client = { game: { findMany: vi.fn() } };
  return { default: client };
});

import prisma from '@/lib/prisma';
import { gameProgress, getPublicLiveGames } from './liveGames';

const findMany = prisma.game.findMany as unknown as ReturnType<typeof vi.fn>;

describe('gameProgress', () => {
  it('is 0 with no groups', () => {
    expect(gameProgress({}, {})).toBe(0);
  });

  it('counts 3 matches for a group of 4 and 5 for a group of 5', () => {
    const groups = { 'Group 1': [1, 2, 3, 4], 'Group 2': [5, 6, 7, 8, 9] };
    const scores = {
      'Group 1': { 0: { team1Score: 21, team2Score: 15 }, 1: { team1Score: 0, team2Score: 0 } },
      'Group 2': { 0: { team1Score: 0, team2Score: 21 } },
    };
    // 2 played of 8
    expect(gameProgress(groups, scores)).toBe(25);
  });

  it('is 100 when every match has a score', () => {
    const groups = { A: [1, 2, 3, 4] };
    const s = { team1Score: 21, team2Score: 19 };
    expect(gameProgress(groups, { A: { 0: s, 1: s, 2: s } })).toBe(100);
  });
});

describe('getPublicLiveGames', () => {
  beforeEach(() => findMany.mockReset());

  it('only queries in-progress games of enabled, public squads', async () => {
    findMany.mockResolvedValue([]);
    await getPublicLiveGames();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'IN_PROGRESS', squad: { enabled: true, isPublic: true } },
      }),
    );
  });

  it('returns a progress summary with the squad, not the raw groups/scores', async () => {
    const createdAt = new Date('2026-09-23T10:00:00Z');
    findMany.mockResolvedValue([
      {
        id: 'game-abcd',
        squadId: 7,
        createdAt,
        status: 'IN_PROGRESS',
        groups: { A: [1, 2, 3, 4] },
        scores: { A: { 0: { team1Score: 21, team2Score: 10 } } },
        squad: { slug: 'alpha', name: 'Alpha' },
      },
    ]);

    expect(await getPublicLiveGames()).toEqual([
      { id: 'game-abcd', progress: 33, createdAt, squad: { slug: 'alpha', name: 'Alpha' } },
    ]);
  });
});
