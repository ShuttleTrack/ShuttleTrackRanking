import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));

import prisma from '@/lib/prisma';
import { loadGameDayState } from './eligibility';
import { reminderRollCall } from './view';
import type { FakePrisma } from './testing/fakePrisma';
import {
  fulltime,
  openSlotPlayer,
  resetIds,
  seedGameDay,
  seedOpenSlot,
  seedSquad,
  seedVote,
} from './testing/scenario';

const db = prisma as unknown as FakePrisma;

beforeEach(() => {
  db.reset();
  resetIds();
  seedSquad(db);
});

describe('reminderRollCall', () => {
  it('matches check-in Yet to vote: structural non-voters only, not assigned open-slot await confirmation', async () => {
    const gd = seedGameDay(db);
    const voted = fulltime(db, 'voted');
    seedVote(db, gd.id, voted.id, 'IN');
    fulltime(db, 'no-vote');
    const assignee = openSlotPlayer(db, 'assignee');
    seedOpenSlot(db, gd.id, assignee.id, { status: 'ASSIGNED' });

    const state = await loadGameDayState(db as never, db.store.gameDay.find((g) => g.id === gd.id)!);
    const roll = reminderRollCall(state);

    expect(roll.yetToVote.map((l) => l.name)).toEqual(['no-vote']);
    expect(roll.in.map((l) => l.name)).toEqual(['voted']);
    expect(roll.waiting).toEqual([]);
    expect(roll.voted).toBe(roll.in.length + roll.out.length);
    expect(roll.holders).toBe(roll.voted + roll.yetToVote.length);
  });

  it('lists open-slot waiting players in join order, not assigned entries', async () => {
    const gd = seedGameDay(db);
    const zed = openSlotPlayer(db, 'zed');
    const amy = openSlotPlayer(db, 'amy');
    const assigned = openSlotPlayer(db, 'assigned');
    seedOpenSlot(db, gd.id, zed.id, { joinedAt: new Date('2026-09-21T09:00:00Z') });
    seedOpenSlot(db, gd.id, amy.id, { joinedAt: new Date('2026-09-21T10:00:00Z') });
    seedOpenSlot(db, gd.id, assigned.id, { status: 'ASSIGNED', joinedAt: new Date('2026-09-21T08:00:00Z') });

    const state = await loadGameDayState(db as never, db.store.gameDay.find((g) => g.id === gd.id)!);
    const roll = reminderRollCall(state);

    expect(roll.waiting.map((l) => l.name)).toEqual(['zed', 'amy']);
  });
});
