import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));
vi.mock('@/lib/telegram/sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/sendMessage')>()),
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
}));

import prisma from '@/lib/prisma';
import type { FakePrisma } from './testing/fakePrisma';
import { castVote, evaluateVote, type VoteContext } from './votes';
import {
  T,
  fulltime,
  openSlotPlayer,
  openSlotsOf,
  resetIds,
  seedGameDay,
  seedOpenSlot,
  seedSquad,
  seedVote,
  votesOf,
} from './testing/scenario';

const db = prisma as unknown as FakePrisma;

beforeEach(() => {
  db.reset();
  resetIds();
  seedSquad(db);
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
});

const choiceOf = (gameDayId: number, playerId: number) =>
  votesOf(db, gameDayId).find((v) => v.playerId === playerId)?.choice ?? null;

describe('castVote while voting is open', () => {
  it('lets a structural holder switch freely, any number of times', async () => {
    const gd = seedGameDay(db);
    const p = fulltime(db, 'ada');
    await castVote(1, gd.id, p.id, 'IN', T.beforeClose);
    await castVote(1, gd.id, p.id, 'OUT', T.beforeClose);
    await castVote(1, gd.id, p.id, 'IN', T.beforeClose);
    expect(choiceOf(gd.id, p.id)).toBe('IN');
    expect(votesOf(db, gd.id)).toHaveLength(1);
  });

  it('rejects a vote from someone who holds no slot, writing nothing', async () => {
    const gd = seedGameDay(db);
    const pool = openSlotPlayer(db, 'pool');
    await expect(castVote(1, gd.id, pool.id, 'IN', T.beforeClose)).rejects.toThrow(/join the waiting list/);
    expect(votesOf(db, gd.id)).toHaveLength(0);
  });

  it('rejects a covered owner - they gave their slot away', async () => {
    const gd = seedGameDay(db);
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    db.insert('slotReplacement', {
      squadId: 1,
      fulltimePlayerId: owner.id,
      replacementPlayerId: filler.id,
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-10-31T00:00:00Z'),
      createdByEmail: 'owner@x.test',
    });
    await expect(castVote(1, gd.id, owner.id, 'IN', T.beforeClose)).rejects.toThrow(/do not hold a slot/);
    await castVote(1, gd.id, filler.id, 'IN', T.beforeClose);
    expect(choiceOf(gd.id, filler.id)).toBe('IN');
  });

  it('rejects a game day belonging to another squad', async () => {
    const gd = seedGameDay(db);
    const p = fulltime(db, 'ada');
    await expect(castVote(2, gd.id, p.id, 'IN', T.beforeClose)).rejects.toThrow(/not found/);
  });
});

describe('castVote after voting has closed', () => {
  it('rejects IN from a structural holder who is not already in', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const out = fulltime(db, 'out');
    const silent = fulltime(db, 'silent');
    seedVote(db, gd.id, out.id, 'OUT');
    await expect(castVote(1, gd.id, out.id, 'IN', T.afterClose)).rejects.toThrow('Voting has closed');
    await expect(castVote(1, gd.id, silent.id, 'IN', T.afterClose)).rejects.toThrow('Voting has closed');
  });

  it('accepts OUT only from a current IN, and rejects a no-vote OUT', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', minPlayers: null });
    const inPlayer = fulltime(db, 'in');
    const silent = fulltime(db, 'silent');
    seedVote(db, gd.id, inPlayer.id, 'IN');
    await castVote(1, gd.id, inPlayer.id, 'OUT', T.afterClose);
    expect(choiceOf(gd.id, inPlayer.id)).toBe('OUT');
    await expect(castVote(1, gd.id, silent.id, 'OUT', T.afterClose)).rejects.toThrow('Voting has closed');
    expect(votesOf(db, gd.id).some((v) => v.playerId === silent.id)).toBe(false);
  });

  it("a WAITING_LIST assignee's OUT succeeds before slotLockAt and withdraws the entry in the same transaction", async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const assignee = openSlotPlayer(db, 'assignee');
    seedOpenSlot(db, gd.id, assignee.id, { status: 'ASSIGNED', source: 'WAITING_LIST' });
    await castVote(1, gd.id, assignee.id, 'OUT', T.afterClose);
    expect(choiceOf(gd.id, assignee.id)).toBe('OUT');
    expect(openSlotsOf(db, gd.id)[0]).toMatchObject({ status: 'WITHDRAWN' });
  });

  it("a WAITING_LIST assignee's OUT fails after slotLockAt, and leaves the entry alone", async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const assignee = openSlotPlayer(db, 'assignee');
    seedOpenSlot(db, gd.id, assignee.id, { status: 'ASSIGNED', source: 'WAITING_LIST' });
    await expect(castVote(1, gd.id, assignee.id, 'OUT', T.afterLock)).rejects.toThrow(/Too late/);
    expect(openSlotsOf(db, gd.id)[0]).toMatchObject({ status: 'ASSIGNED' });
    expect(votesOf(db, gd.id)).toHaveLength(0);
  });

  it("a DIRECT claimer's OUT always fails, but their IN confirms", async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const claimer = openSlotPlayer(db, 'claimer');
    seedOpenSlot(db, gd.id, claimer.id, { status: 'ASSIGNED', source: 'DIRECT' });
    await expect(castVote(1, gd.id, claimer.id, 'OUT', T.afterClose)).rejects.toThrow(/slot is yours/);
    await expect(castVote(1, gd.id, claimer.id, 'OUT', T.afterLock)).rejects.toThrow(/slot is yours/);
    await castVote(1, gd.id, claimer.id, 'IN', T.afterClose);
    expect(choiceOf(gd.id, claimer.id)).toBe('IN');
  });

  it('a holder who gained the slot after the deadline may confirm until slotLockAt, not after', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const late = fulltime(db, 'late');
    const later = fulltime(db, 'later');
    seedVote(db, gd.id, late.id, null, { inheritedFromPlayerId: 999 });
    seedVote(db, gd.id, later.id, null, { inheritedFromPlayerId: 998 });
    await castVote(1, gd.id, late.id, 'IN', T.afterClose);
    expect(votesOf(db, gd.id).find((v) => v.playerId === late.id)).toMatchObject({ choice: 'IN', inheritedFromPlayerId: null });
    await expect(castVote(1, gd.id, later.id, 'IN', T.afterLock)).rejects.toThrow('Voting has closed');
  });

  it('past slotLockAt a holder can still record OUT - it is information, not a vacancy', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const p = fulltime(db, 'p');
    const waiting = openSlotPlayer(db, 'w');
    seedVote(db, gd.id, p.id, 'IN');
    seedOpenSlot(db, gd.id, waiting.id, { status: 'WAITING' });
    await castVote(1, gd.id, p.id, 'OUT', T.afterLock);
    expect(choiceOf(gd.id, p.id)).toBe('OUT');
    expect(openSlotsOf(db, gd.id)[0]).toMatchObject({ status: 'WAITING' }); // nobody promoted
  });
});

describe('CANCELLED rejects everything', () => {
  it('rejects IN and OUT from every kind of voter', async () => {
    const gd = seedGameDay(db, { status: 'CANCELLED' });
    const p = fulltime(db, 'p');
    const a = openSlotPlayer(db, 'a');
    seedOpenSlot(db, gd.id, a.id, { status: 'ASSIGNED', source: 'WAITING_LIST' });
    for (const who of [p.id, a.id]) {
      for (const choice of ['IN', 'OUT'] as const) {
        await expect(castVote(1, gd.id, who, choice, T.beforeClose)).rejects.toThrow(/cancelled/);
      }
    }
  });
});

describe('evaluateVote (the rule table the page also renders from)', () => {
  const base: VoteContext = {
    status: 'VOTING_CLOSED',
    now: T.afterClose,
    slotLockAt: new Date('2026-09-23T15:00:00Z'),
    holding: 'STRUCTURAL',
    source: null,
    nominatorName: null,
    vote: { choice: 'IN', inheritedFromPlayerId: null },
  };

  it('treats re-voting your current choice as a no-op rather than an error', () => {
    expect(evaluateVote(base, 'IN')).toEqual({ ok: true });
    expect(evaluateVote({ ...base, vote: { choice: 'OUT', inheritedFromPlayerId: null } }, 'OUT')).toEqual({ ok: true });
  });

  it('lets an inherited reservation be released with OUT', () => {
    expect(evaluateVote({ ...base, vote: { choice: 'IN', inheritedFromPlayerId: 7 } }, 'OUT')).toEqual({ ok: true });
  });
});
