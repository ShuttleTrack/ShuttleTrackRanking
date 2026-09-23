import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));
vi.mock('@/lib/telegram/sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/sendMessage')>()),
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
}));

import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram/sendMessage';
import type { FakePrisma } from './testing/fakePrisma';
import { cancelGameDay, closeVoting } from './lifecycle';
import { nominate, revokeNomination } from './nominations';
import { planNominationPost, syncUnsettledNominationPosts } from './nominationPosts';
import { runGameDayTick } from './scheduler';
import { castVote } from './votes';
import {
  OPS,
  T,
  fulltime,
  fulltimeIn,
  nominationsOf,
  openSlotPlayer,
  resetIds,
  seedGameDay,
  seedSquad,
} from './testing/scenario';

const db = prisma as unknown as FakePrisma;
const send = sendTelegramMessage as unknown as ReturnType<typeof vi.fn>;
const handOffPosts = () =>
  send.mock.calls.map((c) => c[2] as string).filter((text) => /slot for .* (goes to|now goes to|is no longer passed)/.test(text));

beforeEach(() => {
  db.reset();
  resetIds();
  send.mockReset();
  send.mockResolvedValue({ ok: true });
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.NEXT_PUBLIC_APP_URL = 'https://brs.example.com';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T.beforeClose);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('planNominationPost (told vs true)', () => {
  const row = (id: number, nomineePlayerId: number, extra: Record<string, unknown> = {}) => ({
    id,
    nomineePlayerId,
    endedAt: null as Date | null,
    endReason: null as never,
    announcedAt: null as Date | null,
    retractedAt: null as Date | null,
    ...extra,
  });
  const at = new Date('2026-09-23T09:00:00Z');

  it('announces a new hand-off the group has not heard of', () => {
    expect(planNominationPost([row(1, 7)], false)).toEqual({
      post: { kind: 'CREATED', nomineeId: 7, previousNomineeId: null },
      announceRowId: 1,
      retractRowIds: [],
    });
  });

  it('posts nothing for a hand-off created and ended before the group heard of it', () => {
    expect(planNominationPost([row(1, 7, { endedAt: at, endReason: 'REVOKED' })], false)).toEqual({
      post: null,
      announceRowId: null,
      retractRowIds: [],
    });
  });

  it('says "instead of" only a name the group was told', () => {
    const toldBob = [row(1, 7, { announcedAt: at, endedAt: at, endReason: 'SWITCHED' }), row(2, 8)];
    expect(planNominationPost(toldBob, false).post).toEqual({ kind: 'SWITCHED', nomineeId: 8, previousNomineeId: 7 });
    const neverTold = [row(1, 7, { endedAt: at, endReason: 'SWITCHED' }), row(2, 8)];
    expect(planNominationPost(neverTold, false).post).toEqual({ kind: 'CREATED', nomineeId: 8, previousNomineeId: null });
  });

  it('carries the knowledge over, silently, when the hand-off came back to the same person', () => {
    const rows = [
      row(1, 7, { announcedAt: at, endedAt: at, endReason: 'SWITCHED' }),
      row(2, 8, { endedAt: at, endReason: 'SWITCHED' }),
      row(3, 7),
    ];
    expect(planNominationPost(rows, false)).toEqual({ post: null, announceRowId: 3, retractRowIds: [1] });
  });

  it('settles silently when the game day is cancelled or over', () => {
    const told = [row(1, 7, { announcedAt: at, endedAt: at, endReason: 'GAME_DAY_CANCELLED' })];
    expect(planNominationPost(told, true)).toEqual({ post: null, announceRowId: null, retractRowIds: [1] });
    // A hand-off that ran its course is exactly what the group was told - nothing to do.
    const ran = [row(1, 7, { announcedAt: at, endedAt: at, endReason: 'SESSION_ENDED' })];
    expect(planNominationPost(ran, true)).toEqual({ post: null, announceRowId: null, retractRowIds: [] });
  });
});

describe('what the open-slot group actually receives', () => {
  it('announces a hand-off to the open-slot group only, once', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');

    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    await syncUnsettledNominationPosts(T.beforeClose);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toBe(OPS.telegramOpenSlotChatId);
    expect(handOffPosts()).toEqual([expect.stringContaining("ada's slot for Wednesday 23 Sep, 19:00–22:00 goes to bob.")]);
    expect(nominationsOf(db, gd.id)[0].announcedAt).not.toBeNull();
  });

  it('retries a create that failed at 12:55 after 13:00 - a live hand-off is not noise', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    send.mockResolvedValueOnce({ ok: false, description: 'Too Many Requests' });

    await nominate(1, gd.id, ada.id, bob.id, new Date('2026-09-23T10:55:00Z'));
    expect(nominationsOf(db, gd.id)[0].announcedAt).toBeNull();

    await runGameDayTick(T.afterClose);

    expect(handOffPosts()).toHaveLength(2); // the failed attempt, then the retry
    expect(handOffPosts()[1]).toContain('goes to bob');
    expect(nominationsOf(db, gd.id)[0].announcedAt).not.toBeNull();
  });

  it('posts nothing at all for a hand-off revoked before its create ever landed', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    send.mockResolvedValueOnce({ ok: false, description: 'down' });

    await nominate(1, gd.id, ada.id, bob.id, T.afterReminder);
    await revokeNomination(1, gd.id, ada.id, T.beforeClose);
    await syncUnsettledNominationPosts(T.beforeClose);

    expect(handOffPosts()).toHaveLength(1); // only the failed create attempt
    send.mockClear();
    await syncUnsettledNominationPosts(T.beforeClose);
    expect(send).not.toHaveBeenCalled();
  });

  it('turns a switch after a delivered create into one "instead of" post', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const carol = openSlotPlayer(db, 'carol');

    await nominate(1, gd.id, ada.id, bob.id, T.afterReminder);
    await nominate(1, gd.id, ada.id, carol.id, T.beforeClose);
    await syncUnsettledNominationPosts(T.beforeClose);

    expect(handOffPosts()).toEqual([
      expect.stringContaining('goes to bob.'),
      expect.stringContaining('now goes to carol instead of bob.'),
    ]);
  });

  it('turns a switch after an UNdelivered create into a plain "goes to carol" - one post, no "instead of"', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const carol = openSlotPlayer(db, 'carol');
    send.mockResolvedValueOnce({ ok: false, description: 'down' }).mockResolvedValueOnce({ ok: false, description: 'down' });

    await nominate(1, gd.id, ada.id, bob.id, T.afterReminder);
    await nominate(1, gd.id, ada.id, carol.id, T.beforeClose);
    send.mockClear();
    await runGameDayTick(T.beforeClose);

    expect(handOffPosts()).toEqual([expect.stringContaining('goes to carol.')]);
    expect(handOffPosts()[0]).not.toContain('instead of');
  });

  it('tells the group when a delivered hand-off is voided by a post-deadline OUT', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 15);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    await closeVoting(gd.id, T.atClose);

    await castVote(1, gd.id, ada.id, 'OUT', T.afterClose);

    expect(handOffPosts()).toEqual([
      expect.stringContaining('goes to bob.'),
      expect.stringContaining('is no longer passed to bob.'),
    ]);
  });

  it('settles a cancellation silently in the open-slot group', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    await cancelGameDay(gd.id, 'rain', T.beforeClose);
    await syncUnsettledNominationPosts(T.beforeClose);

    expect(handOffPosts()).toHaveLength(1); // the create only
    expect(nominationsOf(db, gd.id)[0].retractedAt).not.toBeNull();
  });

  it('never posts a hand-off whose session ended before its create landed, and stops retrying it', async () => {
    seedSquad(db);
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    send.mockResolvedValue({ ok: false, description: 'down all day' });
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    send.mockReset();
    send.mockResolvedValue({ ok: true });

    await runGameDayTick(T.afterSession);
    await runGameDayTick(T.afterSession);

    expect(handOffPosts()).toEqual([]);
    expect(nominationsOf(db, gd.id)[0]).toMatchObject({ endReason: 'SESSION_ENDED', announcedAt: null });
  });

  it('with no open-slot chat id: no posts, and nothing marked as announced', async () => {
    seedSquad(db, { gameDayOps: { ...OPS, telegramOpenSlotChatId: null } });
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');

    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    await runGameDayTick(T.beforeClose);

    expect(handOffPosts()).toEqual([]);
    expect(nominationsOf(db, gd.id)[0].announcedAt).toBeNull();
  });
});
