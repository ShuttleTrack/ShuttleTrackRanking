import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const tx = {
    publicRating: { deleteMany: vi.fn(), createMany: vi.fn() },
    publicRatingEvent: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const client = {
    squad: { findMany: vi.fn() },
    encounter: { findMany: vi.fn() },
    player: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    __tx: tx,
  };
  return { default: client };
});

import prisma from '@/lib/prisma';
import { recalculatePublicRatings, recalculatePublicRatingsSafely } from './publicRatingRecalc';

type Mocked = ReturnType<typeof vi.fn>;
const client = prisma as unknown as {
  squad: { findMany: Mocked };
  encounter: { findMany: Mocked };
  player: { findMany: Mocked };
  $transaction: Mocked;
  __tx: {
    publicRating: { deleteMany: Mocked; createMany: Mocked };
    publicRatingEvent: { deleteMany: Mocked; createMany: Mocked };
  };
};

function seedData() {
  client.squad.findMany.mockResolvedValue([
    { id: 1, publicWeight: 0.9 },
    { id: 2, publicWeight: 0.3 },
  ]);
  client.encounter.findMany.mockResolvedValue([
    {
      id: 10,
      squadId: 1,
      encounterDate: new Date('2026-01-07T00:00:00Z'),
      team1: '1:2',
      team2: '3:4',
      team1SetPoints: 21,
      team2SetPoints: 15,
      processed: true,
    },
    {
      id: 11,
      squadId: 2,
      encounterDate: new Date('2026-01-09T00:00:00Z'),
      team1: '11:5',
      team2: '6:7',
      team1SetPoints: 21,
      team2SetPoints: 12,
      processed: true,
    },
  ]);
  client.player.findMany.mockResolvedValue([
    { id: 1, email: 'Alice@Example.com ' },
    { id: 11, email: 'alice@example.com' },
    { id: 2, email: 'b@x.com' },
    { id: 3, email: 'c@x.com' },
    { id: 4, email: 'd@x.com' },
    { id: 5, email: 'e@x.com' },
    { id: 6, email: 'f@x.com' },
    { id: 7, email: 'g@x.com' },
  ]);
}

describe('recalculatePublicRatings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedData();
  });

  it('only loads enabled, public squads and their processed encounters', async () => {
    await recalculatePublicRatings();
    expect(client.squad.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true, isPublic: true } })
    );
    expect(client.encounter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { squadId: { in: [1, 2] }, processed: true } })
    );
  });

  it('deletes then inserts inside one transaction, one row per person across squads', async () => {
    const summary = await recalculatePublicRatings();
    expect(client.$transaction).toHaveBeenCalledTimes(1);

    const tx = client.__tx;
    const order = [
      tx.publicRatingEvent.deleteMany.mock.invocationCallOrder[0],
      tx.publicRating.deleteMany.mock.invocationCallOrder[0],
      tx.publicRating.createMany.mock.invocationCallOrder[0],
      tx.publicRatingEvent.createMany.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const rows = tx.publicRating.createMany.mock.calls[0][0].data as { email: string; matches: number }[];
    expect(rows.filter((r) => r.email === 'alice@example.com')).toEqual([
      expect.objectContaining({ matches: 2 }),
    ]);
    expect(summary).toEqual(expect.objectContaining({ people: 7, matches: 2 }));
  });

  it('runs one recalculation at a time and folds concurrent calls into a single queued run', async () => {
    let active = 0;
    let maxActive = 0;
    client.squad.findMany.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return [{ id: 1, publicWeight: 0.9 }];
    });

    await Promise.all([recalculatePublicRatings(), recalculatePublicRatings(), recalculatePublicRatings()]);
    expect(maxActive).toBe(1);
    expect(client.squad.findMany).toHaveBeenCalledTimes(2);
  });

  it('the safe variant logs instead of throwing', async () => {
    client.squad.findMany.mockRejectedValue(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(recalculatePublicRatingsSafely('test')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
