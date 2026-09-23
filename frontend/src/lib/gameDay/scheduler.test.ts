import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));
vi.mock('@/lib/telegram/sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/sendMessage')>()),
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
}));

import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram/sendMessage';
import type { FakePrisma } from './testing/fakePrisma';
import { candidateDates, decideGameDayActions, decideOpenSlotPing, runGameDayTick } from './scheduler';
import { isoFromDateOnly } from './clock';
import {
  AMS,
  OPS,
  T,
  WEDNESDAY_SCHEDULE,
  fulltimeIn,
  resetIds,
  seedGameDay,
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

const rows = () => db.store.gameDay;
const rowFor = (date: string) => rows().find((g) => isoFromDateOnly(g.gameDate) === date);
const sentTo = () => send.mock.calls.map((c) => c[1] as string);
const sentTexts = () => send.mock.calls.map((c) => c[2] as string);

// ---- pure ----------------------------------------------------------------------------------

describe('decideGameDayActions', () => {
  const base = {
    status: 'VOTING_OPEN' as const,
    gameDate: new Date('2026-09-23T00:00:00Z'),
    startTime: '19:00',
    endTime: '22:00',
    timezone: AMS,
    votesCloseAt: new Date('2026-09-23T11:00:00Z'),
    slotLockAt: new Date('2026-09-23T15:00:00Z'),
    announcedAt: null,
    remindedAt: null,
    openSlotPingedAt: null,
  };

  it('announces as soon as the row exists, but pings/reminds only from their own times', () => {
    expect(decideGameDayActions(base, T.twoDaysBefore)).toEqual({
      announce: 'send',
      ping: null,
      remind: null,
      close: false,
      sync: false,
    });
    expect(decideGameDayActions(base, T.afterPing)).toMatchObject({ ping: 'send', remind: null });
    expect(decideGameDayActions(base, T.afterReminder)).toMatchObject({ ping: 'send', remind: 'send' });
  });

  it('a tick at 13:04 still closes voting', () => {
    expect(decideGameDayActions(base, T.atClose).close).toBe(true);
  });

  it('never repeats an already-stamped action', () => {
    const stamped = { ...base, announcedAt: T.twoDaysBefore, openSlotPingedAt: T.afterPing, remindedAt: T.afterReminder };
    expect(decideGameDayActions(stamped, T.beforeClose)).toMatchObject({ announce: null, ping: null, remind: null });
  });

  it('a tick at 18:00 with remindedAt null does NOT send the reminder (the upper bound)', () => {
    const late = new Date('2026-09-23T16:00:00Z');
    expect(decideGameDayActions(base, late)).toMatchObject({ announce: 'skip', ping: 'skip', remind: 'skip', close: true });
  });

  it('keeps syncing a closed row until slotLockAt, then stops', () => {
    const closed = { ...base, status: 'VOTING_CLOSED' as const };
    expect(decideGameDayActions(closed, T.afterClose)).toMatchObject({ close: false, sync: true, announce: null });
    expect(decideGameDayActions(closed, T.afterLock).sync).toBe(false);
  });
});

describe('candidateDates', () => {
  it("is the squad's wall-clock date, not UTC's - a tick at 00:30 Amsterdam evaluates the new day", () => {
    const halfPastMidnight = new Date('2026-09-22T22:30:00Z'); // 00:30 on the 23rd in Amsterdam
    expect(candidateDates(halfPastMidnight, AMS, 2)).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
  });

  it('scans the whole window from today, not just the date N days out', () => {
    expect(candidateDates(T.twoDaysBefore, AMS, 2)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23']);
  });
});

describe('decideOpenSlotPing', () => {
  it('needs a minimum and a shortfall', () => {
    expect(decideOpenSlotPing({ minPlayers: null, confirmedIn: 0 })).toMatchObject({ send: false });
    expect(decideOpenSlotPing({ minPlayers: 16, confirmedIn: 16 })).toMatchObject({ send: false });
    expect(decideOpenSlotPing({ minPlayers: 16, confirmedIn: 15 })).toEqual({ send: true });
  });
});

// ---- ticks ---------------------------------------------------------------------------------

describe('Pass A - creation', () => {
  it('creates nothing, and sends nothing, for a squad that never configured check-in', async () => {
    seedSquad(db, { gameDayOps: null });
    await runGameDayTick(T.twoDaysBefore);
    expect(rows()).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('creates nothing for a squad without a recurring schedule', async () => {
    seedSquad(db, { schedule: { isRecurring: false } });
    await runGameDayTick(T.twoDaysBefore);
    expect(rows()).toHaveLength(0);
  });

  it('creates the game day voteOpensDaysBefore ahead with a snapshot, and announces it to the main group', async () => {
    seedSquad(db);
    const summary = await runGameDayTick(T.twoDaysBefore);

    expect(summary.created).toBe(1);
    expect(rowFor('2026-09-23')).toMatchObject({
      status: 'VOTING_OPEN',
      startTime: '19:00',
      endTime: '22:00',
      timezone: AMS,
      minPlayers: 16,
      votesCloseAt: new Date('2026-09-23T11:00:00Z'),
      slotLockAt: new Date('2026-09-23T15:00:00Z'),
      announcedAt: T.twoDaysBefore,
    });
    expect(sentTo()).toEqual([OPS.telegramMainChatId]);
    expect(sentTexts()[0]).toContain('https://brs.example.com/s/wed/game-day/2026-09-23');
  });

  it('recovers a session a missed day would have lost: any tick in the window creates it', async () => {
    seedSquad(db);
    await runGameDayTick(new Date('2026-09-23T06:00:00Z')); // the morning of, the first tick in days
    expect(rowFor('2026-09-23')).toBeDefined();
  });

  it('does not create a row after its own deadline', async () => {
    seedSquad(db);
    await runGameDayTick(T.afterClose);
    expect(rowFor('2026-09-23')).toBeUndefined();
  });

  it('a second tick does NOT rewrite an existing row\'s snapshot', async () => {
    seedSquad(db);
    await runGameDayTick(T.twoDaysBefore);
    db.store.squad[0].schedule = { ...WEDNESDAY_SCHEDULE, startTime: '20:00', timezone: 'Europe/London' };
    db.store.squad[0].gameDayOps = { ...OPS, minPlayersForOpenSlot: 18 };

    await runGameDayTick(new Date('2026-09-22T10:00:00Z'));
    expect(rows()).toHaveLength(1);
    expect(rowFor('2026-09-23')).toMatchObject({ startTime: '19:00', timezone: AMS, minPlayers: 16 });
  });
});

describe('Pass A - cancellation', () => {
  it('cancels a skip-dated day, tells the main group, and runs none of its other steps in that tick', async () => {
    seedSquad(db, { schedule: { ...WEDNESDAY_SCHEDULE, skipDates: ['2026-09-23'] } });
    seedGameDay(db, { announcedAt: T.twoDaysBefore }); // already announced; ping due at this tick

    await runGameDayTick(T.afterPing);

    const row = rowFor('2026-09-23')!;
    expect(row.status).toBe('CANCELLED');
    expect(row.openSlotPingedAt).toBeNull();
    expect(sentTo()).toEqual([OPS.telegramMainChatId]);
    expect(sentTexts()[0]).toContain('cancelled');
  });

  it('does not announce the cancellation of a day nobody was told about', async () => {
    seedSquad(db, { schedule: { ...WEDNESDAY_SCHEDULE, skipDates: ['2026-09-23'] } });
    seedGameDay(db);
    await runGameDayTick(T.beforePing);
    expect(rowFor('2026-09-23')!.status).toBe('CANCELLED');
    expect(send).not.toHaveBeenCalled();
  });

  it('never strands an open row: a squad whose check-in was switched off has it cancelled', async () => {
    seedSquad(db, { gameDayOps: null });
    seedGameDay(db);
    await runGameDayTick(T.beforePing);
    expect(rowFor('2026-09-23')!.status).toBe('CANCELLED');
  });

  it('removing the skipDate re-creates the day as a brand-new vote', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { status: 'CANCELLED', announcedAt: T.twoDaysBefore });
    db.insert('gameDayVote', { gameDayId: gd.id, playerId: 999, choice: 'IN' });

    await runGameDayTick(new Date('2026-09-22T10:00:00Z'));

    expect(rowFor('2026-09-23')).toMatchObject({ status: 'VOTING_OPEN', announcedAt: new Date('2026-09-22T10:00:00Z') });
    expect(db.store.gameDayVote).toHaveLength(0);
  });
});

describe('Pass B - the message and deadline steps', () => {
  it('pings the open-slot group once when confirmedIn is below the minimum', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { announcedAt: T.twoDaysBefore });
    fulltimeIn(db, gd.id, 10);

    await runGameDayTick(T.afterPing);
    expect(sentTo()).toEqual([OPS.telegramOpenSlotChatId]);
    expect(sentTexts()[0]).toContain('10 of 16 confirmed');
    expect(rowFor('2026-09-23')).toMatchObject({ openSlotPingedAt: T.afterPing, openSlotPingSent: true });

    send.mockClear();
    await runGameDayTick(new Date('2026-09-23T07:10:00Z'));
    expect(send).not.toHaveBeenCalled();
  });

  it('does not ping when the minimum is already met - but still stamps, so it never retries', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { announcedAt: T.twoDaysBefore });
    fulltimeIn(db, gd.id, 16);

    await runGameDayTick(T.afterPing);
    expect(send).not.toHaveBeenCalled();
    expect(rowFor('2026-09-23')).toMatchObject({ openSlotPingedAt: T.afterPing, openSlotPingSent: false });
  });

  it('sends the 10:00 reminder with the current count', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { announcedAt: T.twoDaysBefore, openSlotPingedAt: T.afterPing });
    fulltimeIn(db, gd.id, 12);
    await runGameDayTick(T.afterReminder);
    expect(sentTo()).toEqual([OPS.telegramMainChatId]);
    expect(sentTexts()[0]).toContain('12 of 16 in so far');
  });

  it('after an outage, skips the late reminder rather than sending it, while voting still closes', async () => {
    seedSquad(db);
    const gd = seedGameDay(db, { announcedAt: T.twoDaysBefore, openSlotPingedAt: T.afterPing });
    fulltimeIn(db, gd.id, 16);

    const summary = await runGameDayTick(new Date('2026-09-23T14:00:00Z'));

    expect(summary.closed).toBe(1);
    const row = rowFor('2026-09-23')!;
    expect(row.status).toBe('VOTING_CLOSED');
    expect(row.remindedAt).not.toBeNull();
    expect(sentTexts().some((t) => t.includes('Reminder'))).toBe(false);
  });

  it('leaves a failed announcement unstamped so the next tick retries it', async () => {
    seedSquad(db);
    send.mockResolvedValueOnce({ ok: false, description: 'Too Many Requests' });
    await runGameDayTick(T.twoDaysBefore);
    expect(rowFor('2026-09-23')!.announcedAt).toBeNull();

    await runGameDayTick(new Date('2026-09-21T10:05:00Z'));
    expect(rowFor('2026-09-23')!.announcedAt).not.toBeNull();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("one squad's failure does not stop another squad's votes from closing", async () => {
    seedSquad(db);
    db.insert('squad', { id: 2, name: 'Broken', slug: 'broken', schedule: WEDNESDAY_SCHEDULE, gameDayOps: OPS });
    seedGameDay(db, { announcedAt: T.twoDaysBefore, openSlotPingedAt: T.afterPing, remindedAt: T.afterReminder });
    db.insert('gameDay', { ...rowFor('2026-09-23')!, id: undefined, squadId: 2, timezone: 'Not/AZone' });

    const summary = await runGameDayTick(T.atClose);
    expect(summary.errors).toBeGreaterThan(0);
    expect(rows().find((g) => g.squadId === 1)!.status).toBe('VOTING_CLOSED');
  });
});
