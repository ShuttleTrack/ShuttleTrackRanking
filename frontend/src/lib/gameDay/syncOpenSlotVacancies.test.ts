import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));
vi.mock('@/lib/telegram/sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/sendMessage')>()),
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
}));

import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram/sendMessage';
import type { FakePrisma } from './testing/fakePrisma';
import { closeVoting, releaseSlot } from './lifecycle';
import { deliverVacancyPlan, joinOpenSlot, planVacancySync } from './openSlots';
import { castVote } from './votes';
import {
  OPS,
  T,
  fulltimeIn,
  openSlotPlayer,
  openSlotsOf,
  resetIds,
  seedGameDay,
  seedOpenSlot,
  seedSquad,
} from './testing/scenario';

const db = prisma as unknown as FakePrisma;
const send = sendTelegramMessage as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  db.reset();
  resetIds();
  send.mockReset();
  send.mockResolvedValue({ ok: true });
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.NEXT_PUBLIC_APP_URL = 'https://brs.example.com';
});

const gameDayRow = (id: number) => db.store.gameDay.find((g) => g.id === id)!;
const sentTexts = () => send.mock.calls.map((c) => c[2] as string);
const sentTo = () => send.mock.calls.map((c) => c[1] as string);

async function syncNow(gameDayId: number, now: Date) {
  const plan = await db.$transaction((tx: never) => planVacancySync(tx, gameDayId, now));
  await deliverVacancyPlan(plan);
  return plan;
}

describe('posting when voting closes', () => {
  it('names the promoted players and says the session is full', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 15);
    const w = openSlotPlayer(db, 'grace');
    seedOpenSlot(db, gd.id, w.id);

    await closeVoting(gd.id, T.atClose);

    expect(sentTo()).toEqual([OPS.telegramOpenSlotChatId]);
    expect(sentTexts()[0]).toContain('grace is in');
    expect(sentTexts()[0]).toContain('The session is full.');
    expect(gameDayRow(gd.id).announcedVacancies).toBe(0);
  });

  it('with an empty waiting list, posts the vacancy count and the link', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 13);

    await closeVoting(gd.id, T.atClose);

    expect(sentTexts()[0]).toContain('3 open slots');
    expect(sentTexts()[0]).toContain('https://brs.example.com/s/wed/game-day/2026-09-23');
    expect(gameDayRow(gd.id).announcedVacancies).toBe(3);
  });

  it('with promotions AND slots left, says both', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 12);
    seedOpenSlot(db, gd.id, openSlotPlayer(db, 'ada').id);
    await closeVoting(gd.id, T.atClose);
    expect(sentTexts()[0]).toMatch(/ada is in[^]*\n3 spots still open/);
  });
});

describe('anti-spam, but never at the cost of a promotion', () => {
  it('does not post again when the vacancy count is unchanged', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 13);
    await closeVoting(gd.id, T.atClose);
    send.mockClear();

    const plan = await syncNow(gd.id, T.afterClose);
    expect(plan).toMatchObject({ changed: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('still promotes when the stored count happens to equal the new one', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', announcedVacancies: 1 });
    fulltimeIn(db, gd.id, 15);
    const w = openSlotPlayer(db, 'w');
    seedOpenSlot(db, gd.id, w.id);

    await syncNow(gd.id, T.afterClose);
    expect(openSlotsOf(db, gd.id)[0]).toMatchObject({ status: 'ASSIGNED' });
  });

  it('promotes with no open-slot chat id configured, skipping only the post', async () => {
    seedSquad(db, { gameDayOps: { ...OPS, telegramOpenSlotChatId: null } });
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 15);
    const w = openSlotPlayer(db, 'w');
    seedOpenSlot(db, gd.id, w.id);

    await closeVoting(gd.id, T.atClose);

    expect(openSlotsOf(db, gd.id)[0]).toMatchObject({ status: 'ASSIGNED' });
    expect(send).not.toHaveBeenCalled();
    // Recorded, so the scheduler does not retry a post that can never be sent.
    expect(gameDayRow(gd.id).announcedVacancies).toBe(0);
  });
});

describe('the "filled up" message', () => {
  it('is sent when a ping went out earlier and the shortfall closed', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { openSlotPingedAt: T.afterPing, openSlotPingSent: true });
    fulltimeIn(db, gd.id, 16);
    await closeVoting(gd.id, T.atClose);
    expect(sentTexts()).toHaveLength(1);
    expect(sentTexts()[0]).toContain('filled up');
  });

  it('is not sent to a group that was never asked for help', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { openSlotPingedAt: T.afterPing, openSlotPingSent: false });
    fulltimeIn(db, gd.id, 16);
    await closeVoting(gd.id, T.atClose);
    expect(send).not.toHaveBeenCalled();
    expect(gameDayRow(gd.id).announcedVacancies).toBe(0);
  });
});

describe('after the deadline', () => {
  it('posts again when a post-deadline OUT widens the gap', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const [first] = fulltimeIn(db, gd.id, 16);
    await closeVoting(gd.id, T.atClose);
    send.mockClear();

    await castVote(1, gd.id, first.id, 'OUT', T.afterClose);
    expect(sentTexts()[0]).toContain('1 open slot');
    expect(gameDayRow(gd.id).announcedVacancies).toBe(1);
  });

  it('a direct claim updates announcedVacancies, so a later OUT is not swallowed as "unchanged"', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const holders = fulltimeIn(db, gd.id, 14);
    await closeVoting(gd.id, T.atClose); // 2 open
    expect(gameDayRow(gd.id).announcedVacancies).toBe(2);

    await joinOpenSlot(1, gd.id, openSlotPlayer(db, 'claimer').id, T.afterClose); // 1 open
    expect(gameDayRow(gd.id).announcedVacancies).toBe(1);
    send.mockClear();

    await castVote(1, gd.id, holders[0].id, 'OUT', T.afterClose); // back to 2 open
    expect(sentTexts()).toHaveLength(1);
    expect(sentTexts()[0]).toContain('2 open slots');
  });

  it('is a no-op past slotLockAt - no promotion, no post', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', announcedVacancies: 0 });
    const [first] = fulltimeIn(db, gd.id, 16);
    const w = openSlotPlayer(db, 'w');
    seedOpenSlot(db, gd.id, w.id);

    await castVote(1, gd.id, first.id, 'OUT', T.afterLock);
    expect(openSlotsOf(db, gd.id)[0]).toMatchObject({ status: 'WAITING' });
    expect(send).not.toHaveBeenCalled();
  });

  it('an admin release past the lock frees the slot and posts nothing', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', announcedVacancies: 0 });
    fulltimeIn(db, gd.id, 15);
    const claimer = openSlotPlayer(db, 'claimer');
    seedOpenSlot(db, gd.id, claimer.id, { status: 'ASSIGNED', source: 'DIRECT' });

    await releaseSlot(1, gd.id, claimer.id, T.afterLock);
    expect(openSlotsOf(db, gd.id)[0]).toMatchObject({ status: 'WITHDRAWN' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('no minimum configured', () => {
  it('no-ops entirely', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { minPlayers: null });
    fulltimeIn(db, gd.id, 3);
    seedOpenSlot(db, gd.id, openSlotPlayer(db, 'w').id);
    await closeVoting(gd.id, T.atClose);
    expect(openSlotsOf(db, gd.id)[0]).toMatchObject({ status: 'WAITING' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('a failed send', () => {
  it('leaves announcedVacancies alone so the next pass retries - and promotes nobody twice', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 14);
    const [a, b, c] = [openSlotPlayer(db, 'a'), openSlotPlayer(db, 'b'), openSlotPlayer(db, 'c')];
    [a, b, c].forEach((p, i) => seedOpenSlot(db, gd.id, p.id, { joinedAt: new Date(Date.UTC(2026, 8, 22, 12, i)) }));

    send.mockResolvedValueOnce({ ok: false, description: 'chat not found' });
    await closeVoting(gd.id, T.atClose);
    expect(gameDayRow(gd.id).announcedVacancies).toBeNull();
    expect(openSlotsOf(db, gd.id).filter((s) => s.status === 'ASSIGNED').map((s) => s.playerId)).toEqual([a.id, b.id]);

    // The retry (the scheduler's Pass B) posts the lost message...
    await syncNow(gd.id, T.afterClose);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sentTexts()[1]).toContain('The session is full.');
    expect(gameDayRow(gd.id).announcedVacancies).toBe(0);
    // ...without promoting anyone again, and then goes quiet.
    expect(openSlotsOf(db, gd.id).filter((s) => s.status === 'ASSIGNED')).toHaveLength(2);
    await syncNow(gd.id, T.afterClose);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
