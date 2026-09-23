import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));

import prisma from '@/lib/prisma';
import type { FakePrisma } from './testing/fakePrisma';
import {
  classifySlotHolders,
  getGameDayVoters,
  getOpenSlotPool,
  getStructuralSlotHolders,
} from './eligibility';
import { dateOnlyFromIso } from './clock';
import { fulltime, openSlotPlayer, resetIds, seedGameDay, seedOpenSlot, seedReplacement, seedSquad } from './testing/scenario';

const db = prisma as unknown as FakePrisma;
const ids = (players: { id: number }[]) => players.map((p) => p.id).sort();

beforeEach(() => {
  db.reset();
  resetIds();
  seedSquad(db);
});

describe('eligibility resolves against the GAME DATE, not today', () => {
  // "Today" is Monday 21 Sep; the vote is for Wednesday 23 Sep.
  const today = dateOnlyFromIso('2026-09-21');
  const gameDate = dateOnlyFromIso('2026-09-23');

  it('excludes an owner whose window starts between today and the game date, and includes their filler', async () => {
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    // Active on the game date, NOT today - a today-based helper would get both answers backwards.
    seedReplacement(db, owner.id, filler.id, '2026-09-22', '2026-10-31');

    expect(ids(await getStructuralSlotHolders(1, gameDate))).toEqual([filler.id]);
    expect(ids(await getStructuralSlotHolders(1, today))).toEqual([owner.id]);
    expect(ids(await getOpenSlotPool(1, gameDate))).toEqual([]);
    expect(ids(await getOpenSlotPool(1, today))).toEqual([filler.id]);
  });

  it('the reverse: a window active today but ended before the game date gives the slot back', async () => {
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    seedReplacement(db, owner.id, filler.id, '2026-09-01', '2026-09-22');

    expect(ids(await getStructuralSlotHolders(1, gameDate))).toEqual([owner.id]);
    expect(ids(await getStructuralSlotHolders(1, today))).toEqual([filler.id]);
  });

  it('a cancelled window excludes nobody', async () => {
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    seedReplacement(db, owner.id, filler.id, '2026-09-01', '2026-10-31', { cancelledAt: new Date('2026-09-10') });

    expect(ids(await getStructuralSlotHolders(1, gameDate))).toEqual([owner.id]);
    expect(ids(await getOpenSlotPool(1, gameDate))).toEqual([filler.id]);
  });

  it('a DISABLED player is in no pool', async () => {
    fulltime(db, 'gone', { playerStatus: 'DISABLED' });
    openSlotPlayer(db, 'gone2', { playerStatus: 'DISABLED' });
    expect(await getStructuralSlotHolders(1, gameDate)).toEqual([]);
    expect(await getOpenSlotPool(1, gameDate)).toEqual([]);
  });

  it('an assigned open-slot player is a voter but not a structural holder', async () => {
    const ft = fulltime(db, 'ft');
    const assigned = openSlotPlayer(db, 'assigned');
    const waiting = openSlotPlayer(db, 'waiting');
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    seedOpenSlot(db, gd.id, assigned.id, { status: 'ASSIGNED', source: 'WAITING_LIST' });
    seedOpenSlot(db, gd.id, waiting.id, { status: 'WAITING' });

    expect(ids(await getGameDayVoters(gd as never))).toEqual([ft.id, assigned.id].sort());
    expect(ids(await getStructuralSlotHolders(1, gameDate))).toEqual([ft.id]);
  });
});

describe('classifySlotHolders', () => {
  it('structural holders and the open-slot pool never intersect', () => {
    const players = [
      { id: 1, playerType: 'FULLTIME' as const, playerStatus: 'ACTIVE' },
      { id: 2, playerType: 'FULLTIME' as const, playerStatus: 'ACTIVE' },
      { id: 3, playerType: 'OPEN_SLOT' as const, playerStatus: 'ACTIVE' },
      { id: 4, playerType: 'OPEN_SLOT' as const, playerStatus: null },
      { id: 5, playerType: 'OPEN_SLOT' as const, playerStatus: 'DISABLED' },
    ];
    const { structuralHolders, openSlotPool } = classifySlotHolders(players, [
      { fulltimePlayerId: 2, replacementPlayerId: 3 },
    ]);
    expect(ids(structuralHolders)).toEqual([1, 3]);
    expect(ids(openSlotPool)).toEqual([4]);
    const overlap = structuralHolders.filter((p) => openSlotPool.some((q) => q.id === p.id));
    expect(overlap).toEqual([]);
  });
});
