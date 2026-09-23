import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));
vi.mock('@/lib/telegram/sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/sendMessage')>()),
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
}));

import prisma from '@/lib/prisma';
import type { FakePrisma } from './testing/fakePrisma';
import { approveCancellationRequest, createSlotReplacement } from '@/lib/replacements';
import { dateOnlyFromIso } from './clock';
import { removeDisabledPlayerFromGameDays } from './lifecycle';
import { joinOpenSlot } from './openSlots';
import { castVote } from './votes';
import {
  T,
  fulltime,
  fulltimeIn,
  openSlotPlayer,
  openSlotsOf,
  resetIds,
  seedGameDay,
  seedOpenSlot,
  seedReplacement,
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
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

const voteOf = (gameDayId: number, playerId: number) => votesOf(db, gameDayId).find((v) => v.playerId === playerId) ?? null;
const entryOf = (gameDayId: number, playerId: number) => openSlotsOf(db, gameDayId).find((s) => s.playerId === playerId) ?? null;

function nominate(owner: { id: number; email: string }, filler: { id: number }, start = '2026-09-23', end = '2026-10-07') {
  return createSlotReplacement(1, {
    fulltimePlayerId: owner.id,
    replacementPlayerId: filler.id,
    startDate: start,
    endDate: end,
    createdByEmail: owner.email,
  });
}

describe('createSlotReplacement reconciles the live game days it covers', () => {
  it('while voting is open: drops the owner\'s vote and deletes (never WITHDRAWs) the filler\'s WAITING row', async () => {
    vi.setSystemTime(T.twoDaysBefore);
    const gd = seedGameDay(db);
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    seedVote(db, gd.id, owner.id, 'IN');
    seedOpenSlot(db, gd.id, filler.id, { status: 'WAITING' });

    await nominate(owner, filler);

    expect(voteOf(gd.id, owner.id)).toBeNull();
    expect(entryOf(gd.id, filler.id)).toBeNull();
    // The owner is now an observer; the filler votes for themselves.
    await expect(castVote(1, gd.id, owner.id, 'IN')).rejects.toThrow(/do not hold a slot/);
    await castVote(1, gd.id, filler.id, 'IN');
    expect(voteOf(gd.id, filler.id)).toMatchObject({ choice: 'IN', inheritedFromPlayerId: null });
  });

  it('after the deadline: deletes the filler\'s ASSIGNED row too, and syncs the slot it freed', async () => {
    vi.setSystemTime(T.afterClose);
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', votingClosedAt: T.atClose, announcedVacancies: 0 });
    const owner = fulltime(db, 'owner');
    seedVote(db, gd.id, owner.id, 'IN');
    fulltimeIn(db, gd.id, 14);
    const filler = openSlotPlayer(db, 'filler');
    seedOpenSlot(db, gd.id, filler.id, { status: 'ASSIGNED', source: 'WAITING_LIST' });
    const standby = openSlotPlayer(db, 'standby');
    seedOpenSlot(db, gd.id, standby.id, { status: 'WAITING' });

    await nominate(owner, filler);

    expect(entryOf(gd.id, filler.id)).toBeNull();
    expect(voteOf(gd.id, filler.id)).toMatchObject({ choice: 'IN', inheritedFromPlayerId: owner.id });
    // Their open slot is free now, so the standby gets it.
    expect(entryOf(gd.id, standby.id)).toMatchObject({ status: 'ASSIGNED' });
  });

  it('never touches a game day whose session has already ended', async () => {
    vi.setSystemTime(T.afterSession);
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    seedVote(db, gd.id, owner.id, 'IN');
    await nominate(owner, filler, '2026-09-23', '2026-10-14');
    expect(voteOf(gd.id, owner.id)).toMatchObject({ choice: 'IN' });
  });
});

describe('ending a window hands the slot back', () => {
  function pendingWindow(owner: { id: number }, filler: { id: number }, requestedEnd: string | null) {
    return seedReplacement(db, owner.id, filler.id, '2026-09-16', '2026-10-14', {
      cancellationRequestedAt: new Date('2026-09-22T10:00:00Z'),
      cancellationRequestedEndDate: requestedEnd ? dateOnlyFromIso(requestedEnd) : null,
    });
  }

  it('approving a cancellation after the deadline lets the owner vote IN again, without resurrecting their old vote', async () => {
    vi.setSystemTime(T.afterClose);
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', votingClosedAt: T.atClose, minPlayers: null });
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    const window = pendingWindow(owner, filler, null);
    seedVote(db, gd.id, filler.id, 'OUT');

    await approveCancellationRequest(1, window.id);

    expect(voteOf(gd.id, filler.id)).toBeNull();
    // A choice-less marker: they gained the slot after the deadline, and have not spoken.
    expect(voteOf(gd.id, owner.id)).toMatchObject({ choice: null, inheritedFromPlayerId: filler.id });
    await castVote(1, gd.id, owner.id, 'IN');
    expect(voteOf(gd.id, owner.id)).toMatchObject({ choice: 'IN', inheritedFromPlayerId: null });
  });

  it('a shorten that pulls endDate before the game date reconciles it too, without setting cancelledAt', async () => {
    vi.setSystemTime(T.beforeClose);
    const gd = seedGameDay(db);
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    const window = pendingWindow(owner, filler, '2026-09-20');
    seedVote(db, gd.id, filler.id, 'IN');

    const updated = await approveCancellationRequest(1, window.id);

    expect(updated.cancelledAt).toBeNull();
    expect(voteOf(gd.id, filler.id)).toBeNull();
    await castVote(1, gd.id, owner.id, 'IN');
  });

  it('a shorten that still covers the game date changes nothing on it', async () => {
    vi.setSystemTime(T.beforeClose);
    const gd = seedGameDay(db);
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    const window = pendingWindow(owner, filler, '2026-09-30');
    seedVote(db, gd.id, filler.id, 'IN');

    await approveCancellationRequest(1, window.id);
    expect(voteOf(gd.id, filler.id)).toMatchObject({ choice: 'IN' });
  });

  it('a player removed from the waiting list by a transfer can rejoin once the window is cancelled', async () => {
    vi.setSystemTime(T.twoDaysBefore);
    const gd = seedGameDay(db);
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    seedOpenSlot(db, gd.id, filler.id, { status: 'WAITING' });

    const window = await nominate(owner, filler);
    expect(entryOf(gd.id, filler.id)).toBeNull();

    db.store.slotReplacement.find((r) => r.id === window.id)!.cancellationRequestedAt = new Date();
    await approveCancellationRequest(1, window.id);
    await joinOpenSlot(1, gd.id, filler.id);
    expect(entryOf(gd.id, filler.id)).toMatchObject({ status: 'WAITING' });
  });
});

describe('removePlayerFromGameDays (a DISABLED player)', () => {
  it("clears today's already-closed game day as well as later ones, and never creates a row", async () => {
    vi.setSystemTime(T.afterClose);
    const today = seedGameDay(db, { status: 'VOTING_CLOSED', votingClosedAt: T.atClose, announcedVacancies: 0 });
    const nextWeek = seedGameDay(db, { gameDate: '2026-09-30' });
    const p = openSlotPlayer(db, 'p');
    seedOpenSlot(db, today.id, p.id, { status: 'ASSIGNED', source: 'DIRECT' });
    seedVote(db, today.id, p.id, 'IN');
    seedOpenSlot(db, nextWeek.id, p.id, { status: 'WAITING' });
    const gameDaysBefore = db.store.gameDay.length;

    await removeDisabledPlayerFromGameDays(1, p.id);

    expect(votesOf(db, today.id)).toHaveLength(0);
    expect(openSlotsOf(db, today.id)).toHaveLength(0);
    expect(openSlotsOf(db, nextWeek.id)).toHaveLength(0);
    expect(db.store.gameDay).toHaveLength(gameDaysBefore);
  });
});
