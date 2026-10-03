import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));
vi.mock('@/lib/telegram/sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/sendMessage')>()),
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
}));

import type { GameDay, Player } from '@prisma/client';
import prisma from '@/lib/prisma';
import type { FakePrisma } from './testing/fakePrisma';
import { closeVoting } from './lifecycle';
import { joinOpenSlot, leaveOpenSlot, planVacancySync } from './openSlots';
import { getGameDayView } from './view';
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
  seedSquad,
} from './testing/scenario';

const db = prisma as unknown as FakePrisma;

beforeEach(() => {
  db.reset();
  resetIds();
  seedSquad(db);
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
});

const statusOf = (gameDayId: number, playerId: number) =>
  openSlotsOf(db, gameDayId).find((s) => s.playerId === playerId)?.status ?? null;

function waitingList(gameDayId: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const p = openSlotPlayer(db, `w${i + 1}`);
    // Joined in reverse id order, so a sort by id would give the wrong answer.
    seedOpenSlot(db, gameDayId, p.id, { status: 'WAITING', joinedAt: new Date(Date.UTC(2026, 8, 22, 12, 0, 60 - i)) });
    return p;
  });
}

describe('the deadline pass', () => {
  it('promotes exactly `vacancies` players, strictly in joinedAt order, and does not loop', async () => {
    const gd = seedGameDay(db); // minPlayers 16
    fulltimeIn(db, gd.id, 13);
    const [w1, w2, w3, w4, w5] = waitingList(gd.id, 5); // w5 joined first, w1 last

    await closeVoting(gd.id, T.atClose);

    expect([w5, w4, w3].map((p) => statusOf(gd.id, p.id))).toEqual(['ASSIGNED', 'ASSIGNED', 'ASSIGNED']);
    expect([w2, w1].map((p) => statusOf(gd.id, p.id))).toEqual(['WAITING', 'WAITING']);
    expect(openSlotsOf(db, gd.id).filter((s) => s.status === 'ASSIGNED').every((s) => s.source === 'WAITING_LIST')).toBe(true);

    // A second pass finds the session full: an unvoted assignee still holds their slot.
    const again = await db.$transaction((tx: never) => planVacancySync(tx, gd.id, T.afterClose));
    expect(again).toMatchObject({ promoted: [], remaining: 0 });
    expect(openSlotsOf(db, gd.id).filter((s) => s.status === 'ASSIGNED')).toHaveLength(3);
  });

  it('an assignee confirming does not re-open or double-count their slot', async () => {
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 15);
    const [w1, w2] = waitingList(gd.id, 2);
    await closeVoting(gd.id, T.atClose);
    const promoted = statusOf(gd.id, w2.id) === 'ASSIGNED' ? w2 : w1;

    await castVote(1, gd.id, promoted.id, 'IN', T.afterClose);
    expect(openSlotsOf(db, gd.id).filter((s) => s.status === 'ASSIGNED')).toHaveLength(1);
    expect(openSlotsOf(db, gd.id).filter((s) => s.status === 'WAITING')).toHaveLength(1);
  });

  it("an assignee's OUT promotes the next person on the same pass", async () => {
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 15);
    const [w1, w2] = waitingList(gd.id, 2); // w2 joined first
    await closeVoting(gd.id, T.atClose);
    expect(statusOf(gd.id, w2.id)).toBe('ASSIGNED');

    await castVote(1, gd.id, w2.id, 'OUT', T.afterClose);
    expect(statusOf(gd.id, w2.id)).toBe('WITHDRAWN');
    expect(statusOf(gd.id, w1.id)).toBe('ASSIGNED');
  });
});

describe('joining and claiming', () => {
  it('joins the waiting list from creation - no ping needed first', async () => {
    const gd = seedGameDay(db);
    const p = openSlotPlayer(db, 'early');
    await joinOpenSlot(1, gd.id, p.id, T.twoDaysBefore);
    expect(statusOf(gd.id, p.id)).toBe('WAITING');
  });

  it('rejects a structural holder and a non-open-slot player', async () => {
    const gd = seedGameDay(db);
    const ft = fulltime(db, 'ft');
    await expect(joinOpenSlot(1, gd.id, ft.id, T.beforeClose)).rejects.toThrow(/already hold a slot/);
  });

  it('after the deadline, claims directly while vacancies remain, then queues once the session is full', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', minPlayers: 16 });
    fulltimeIn(db, gd.id, 14);
    const [a, b, c] = [openSlotPlayer(db, 'a'), openSlotPlayer(db, 'b'), openSlotPlayer(db, 'c')];

    await joinOpenSlot(1, gd.id, a.id, T.afterClose);
    await joinOpenSlot(1, gd.id, b.id, T.afterClose);
    await joinOpenSlot(1, gd.id, c.id, T.afterClose);

    expect(openSlotsOf(db, gd.id).map((s) => [s.playerId, s.status, s.source])).toEqual([
      [a.id, 'ASSIGNED', 'DIRECT'],
      [b.id, 'ASSIGNED', 'DIRECT'],
      [c.id, 'WAITING', null],
    ]);
  });

  it('two concurrent claims for the last slot leave exactly one winner; the other is queued', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', minPlayers: 16 });
    fulltimeIn(db, gd.id, 15);
    const [a, b] = [openSlotPlayer(db, 'a'), openSlotPlayer(db, 'b')];

    const results = await Promise.allSettled([
      joinOpenSlot(1, gd.id, a.id, T.afterClose),
      joinOpenSlot(1, gd.id, b.id, T.afterClose),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const rows = openSlotsOf(db, gd.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((s) => s.status === 'ASSIGNED' && s.source === 'DIRECT')).toHaveLength(1);
    expect(rows.filter((s) => s.status === 'WAITING')).toHaveLength(1);
  });

  it('a player who queued after the deadline is promoted when a holder drops out before slotLockAt', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', minPlayers: 16 });
    const [ft1] = fulltimeIn(db, gd.id, 16);
    const late = openSlotPlayer(db, 'late');

    await joinOpenSlot(1, gd.id, late.id, T.afterClose);
    expect(statusOf(gd.id, late.id)).toBe('WAITING');

    await castVote(1, gd.id, ft1.id, 'OUT', T.afterClose);
    const entry = openSlotsOf(db, gd.id).find((s) => s.playerId === late.id);
    expect(entry).toMatchObject({ status: 'ASSIGNED', source: 'WAITING_LIST' });
  });

  it('someone left waiting at the deadline stays ahead of a player who queued after it', async () => {
    const gd = seedGameDay(db); // minPlayers 16
    const [ft1] = fulltimeIn(db, gd.id, 15);
    const [early1, early2] = waitingList(gd.id, 2); // early2 joined first
    await closeVoting(gd.id, T.atClose);
    expect(statusOf(gd.id, early2.id)).toBe('ASSIGNED');

    const late = openSlotPlayer(db, 'late');
    await joinOpenSlot(1, gd.id, late.id, T.afterClose);
    expect(statusOf(gd.id, late.id)).toBe('WAITING');

    await castVote(1, gd.id, ft1.id, 'OUT', T.afterClose);
    expect(statusOf(gd.id, early1.id)).toBe('ASSIGNED');
    expect(statusOf(gd.id, late.id)).toBe('WAITING');
  });

  it('joining again while already queued after the deadline is a no-op', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', minPlayers: 16 });
    fulltimeIn(db, gd.id, 16);
    const p = openSlotPlayer(db, 'p');
    const first = await joinOpenSlot(1, gd.id, p.id, T.afterClose);
    const again = await joinOpenSlot(1, gd.id, p.id, T.afterClose);
    expect(again.id).toBe(first.id);
    expect(openSlotsOf(db, gd.id)).toHaveLength(1);
  });

  it('is rejected outright past slotLockAt, on a cancelled day, and with no minimum', async () => {
    const closed = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const p = openSlotPlayer(db, 'p');
    await expect(joinOpenSlot(1, closed.id, p.id, T.afterLock)).rejects.toThrow(/Too late/);

    const cancelled = seedGameDay(db, { gameDate: '2026-09-30', status: 'CANCELLED' });
    await expect(joinOpenSlot(1, cancelled.id, p.id, T.beforeClose)).rejects.toThrow(/cancelled/);

    const noMin = seedGameDay(db, { gameDate: '2026-10-07', minPlayers: null });
    await expect(joinOpenSlot(1, noMin.id, p.id, T.beforeClose)).rejects.toThrow(/no open slots/);
  });

  it('WITHDRAWN is terminal - a clean 400, not a unique-constraint 500', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', minPlayers: 20 });
    const p = openSlotPlayer(db, 'p');
    seedOpenSlot(db, gd.id, p.id, { status: 'WITHDRAWN' });
    await expect(joinOpenSlot(1, gd.id, p.id, T.afterClose)).rejects.toThrow(/cannot rejoin/);
  });
});

describe('leaving the waiting list', () => {
  it('deletes a WAITING row, so the player can change their mind and rejoin', async () => {
    const gd = seedGameDay(db);
    const p = openSlotPlayer(db, 'p');
    await joinOpenSlot(1, gd.id, p.id, T.beforeClose);
    await leaveOpenSlot(1, gd.id, p.id);
    expect(openSlotsOf(db, gd.id)).toHaveLength(0);
    await joinOpenSlot(1, gd.id, p.id, T.beforeClose);
    expect(statusOf(gd.id, p.id)).toBe('WAITING');
  });

  it('refuses to release an ASSIGNED slot - that is castVote(OUT)', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED' });
    const p = openSlotPlayer(db, 'p');
    seedOpenSlot(db, gd.id, p.id, { status: 'ASSIGNED', source: 'WAITING_LIST' });
    await expect(leaveOpenSlot(1, gd.id, p.id)).rejects.toThrow(/I'm out/);
  });
});

describe("the page's open-slot actions after the deadline", () => {
  const gameDayRow = (id: number) => db.store.gameDay.find((g) => g.id === id)! as unknown as GameDay;
  const playerRow = (id: number) => db.store.player.find((p) => p.id === id) as unknown as Player;

  it('offers the waiting list while the session is full, and a claim while a slot is free', async () => {
    const full = seedGameDay(db, { status: 'VOTING_CLOSED', minPlayers: 16 });
    fulltimeIn(db, full.id, 16);
    const p = openSlotPlayer(db, 'p');
    const fullView = await getGameDayView(gameDayRow(full.id), playerRow(p.id), T.afterClose);
    expect(fullView.actions.joinWaitingList).toEqual({ ok: true });
    expect(fullView.actions.claimSlot).toEqual({ ok: false, reason: 'No open slots available' });

    const short = seedGameDay(db, { gameDate: '2026-09-30', status: 'VOTING_CLOSED', minPlayers: 16 });
    fulltimeIn(db, short.id, 15, 's');
    const shortView = await getGameDayView(gameDayRow(short.id), playerRow(p.id), T.afterClose);
    expect(shortView.actions.claimSlot).toEqual({ ok: true });
    expect(shortView.actions.joinWaitingList).toEqual({ ok: false, reason: 'There is an open slot - claim it instead' });
  });

  it('offers neither past slotLockAt', async () => {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', minPlayers: 16 });
    fulltimeIn(db, gd.id, 16);
    const p = openSlotPlayer(db, 'p');
    const view = await getGameDayView(gameDayRow(gd.id), playerRow(p.id), T.afterLock);
    expect(view.actions.joinWaitingList.ok).toBe(false);
    expect(view.actions.claimSlot.ok).toBe(false);
  });
});
