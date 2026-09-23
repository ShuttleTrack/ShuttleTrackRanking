import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));
vi.mock('@/lib/telegram/sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/sendMessage')>()),
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
}));

import prisma from '@/lib/prisma';
import type { FakePrisma } from './testing/fakePrisma';
import { createSlotReplacement } from '@/lib/replacements';
import { computeGameDayCounts } from './counts';
import { loadGameDayState } from './eligibility';
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
  seedVote,
} from './testing/scenario';

// The regression test for the class of bug the plan's third review found, stated as a total:
// after the deadline, transferring a slot whose holder voted IN must not let the vacancy sync
// promote a waiting-list player into it - or the incoming holder's IN later puts 17 people on a
// 16-person session, two of them in one physical slot.
const db = prisma as unknown as FakePrisma;

beforeEach(() => {
  db.reset();
  resetIds();
  seedSquad(db);
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T.afterClose);
});

afterEach(() => {
  vi.useRealTimers();
});

async function countsFor(gameDayId: number) {
  const gameDay = db.store.gameDay.find((g) => g.id === gameDayId)!;
  return computeGameDayCounts(await loadGameDayState(prisma, gameDay as never));
}

const statusOf = (gameDayId: number, playerId: number) =>
  openSlotsOf(db, gameDayId).find((s) => s.playerId === playerId)?.status ?? null;

// A replacement window covering the 23rd with the 3 playing days createSlotReplacement requires.
function transfer(ownerEmail: string, ownerId: number, fillerId: number) {
  return createSlotReplacement(1, {
    fulltimePlayerId: ownerId,
    replacementPlayerId: fillerId,
    startDate: '2026-09-23',
    endDate: '2026-10-07',
    createdByEmail: ownerEmail,
  });
}

describe('a post-deadline transfer of an IN slot', () => {
  function seedFullSession() {
    const gd = seedGameDay(db, { status: 'VOTING_CLOSED', votingClosedAt: T.atClose, announcedVacancies: 0 });
    const owner = fulltime(db, 'owner');
    seedVote(db, gd.id, owner.id, 'IN');
    fulltimeIn(db, gd.id, 12); // 13 structural INs including the owner
    for (let i = 0; i < 3; i++) {
      seedOpenSlot(db, gd.id, openSlotPlayer(db, `assigned${i}`).id, { status: 'ASSIGNED', source: 'WAITING_LIST', assignedAt: T.atClose });
    }
    const standby = openSlotPlayer(db, 'standby');
    seedOpenSlot(db, gd.id, standby.id, { status: 'WAITING' });
    const filler = openSlotPlayer(db, 'filler');
    return { gd, owner, standby, filler };
  }

  it('keeps slotsHeld at 16 at every step and promotes nobody', async () => {
    const { gd, owner, standby, filler } = seedFullSession();
    expect((await countsFor(gd.id)).slotsHeld).toBe(16);

    await transfer(owner.email, owner.id, filler.id);
    const afterTransfer = await countsFor(gd.id);
    expect(afterTransfer.slotsHeld).toBe(16);
    expect(statusOf(gd.id, standby.id)).toBe('WAITING'); // the sync promoted nobody
    expect(afterTransfer.inheritedReservationIds).toEqual([filler.id]); // awaiting confirmation
    const confirmedBefore = afterTransfer.confirmedIn;

    await castVote(1, gd.id, filler.id, 'IN');
    const afterConfirm = await countsFor(gd.id);
    expect(afterConfirm.slotsHeld).toBe(16);
    expect(afterConfirm.confirmedIn).toBe(confirmedBefore + 1);
    expect(afterConfirm.inheritedReservationIds).toEqual([]);
    expect(statusOf(gd.id, standby.id)).toBe('WAITING');
  });

  it("the incoming holder's OUT drops the reservation, and THEN the waiting list is promoted", async () => {
    const { gd, owner, standby, filler } = seedFullSession();
    await transfer(owner.email, owner.id, filler.id);

    await castVote(1, gd.id, filler.id, 'OUT');
    expect(statusOf(gd.id, standby.id)).toBe('ASSIGNED');
    expect((await countsFor(gd.id)).slotsHeld).toBe(16);
  });
});

describe('a post-deadline transfer of an OUT (or absent) slot', () => {
  for (const outgoing of ['OUT', 'absent'] as const) {
    it(`(${outgoing}) inherits no reservation, promotes nobody, and the incoming IN adds exactly one`, async () => {
      const gd = seedGameDay(db, { status: 'VOTING_CLOSED', votingClosedAt: T.atClose, announcedVacancies: 0 });
      const owner = fulltime(db, 'owner');
      if (outgoing === 'OUT') seedVote(db, gd.id, owner.id, 'OUT');
      fulltimeIn(db, gd.id, 12);
      for (let i = 0; i < 4; i++) {
        seedOpenSlot(db, gd.id, openSlotPlayer(db, `assigned${i}`).id, { status: 'ASSIGNED', source: 'WAITING_LIST', assignedAt: T.atClose });
      }
      const standby = openSlotPlayer(db, 'standby');
      seedOpenSlot(db, gd.id, standby.id, { status: 'WAITING' });
      const filler = openSlotPlayer(db, 'filler');

      await transfer(owner.email, owner.id, filler.id);
      const afterTransfer = await countsFor(gd.id);
      expect(afterTransfer.slotsHeld).toBe(16);
      expect(afterTransfer.inheritedReservationIds).toEqual([]);
      expect(statusOf(gd.id, standby.id)).toBe('WAITING');

      // They gained the slot after the deadline, so they may still confirm it.
      await castVote(1, gd.id, filler.id, 'IN');
      expect((await countsFor(gd.id)).slotsHeld).toBe(17);
    });
  }
});
