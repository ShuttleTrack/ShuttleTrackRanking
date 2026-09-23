import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', async () => ({ default: (await import('./testing/fakePrisma')).createFakePrisma() }));
vi.mock('@/lib/telegram/sendMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram/sendMessage')>()),
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
}));

import type { GameDay, Player } from '@prisma/client';
import prisma from '@/lib/prisma';
import type { FakePrisma } from './testing/fakePrisma';
import { createSlotReplacement } from '@/lib/replacements';
import { computeGameDayCounts } from './counts';
import { loadGameDayState } from './eligibility';
import { cancelGameDay, closeVoting, releaseSlot, removeDisabledPlayerFromGameDays } from './lifecycle';
import { nominate, revokeNomination } from './nominations';
import { joinOpenSlot } from './openSlots';
import { runGameDayTick } from './scheduler';
import { getGameDayAttendance, getGameDayView } from './view';
import { castVote } from './votes';
import {
  GAME_DATE,
  T,
  WEDNESDAY_SCHEDULE,
  fulltime,
  fulltimeIn,
  nominationsOf,
  openSlotPlayer,
  openSlotsOf,
  resetIds,
  seedGameDay,
  seedNomination,
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
  vi.setSystemTime(T.beforeClose);
});

afterEach(() => {
  vi.useRealTimers();
});

const gameDayRow = (id: number) => db.store.gameDay.find((g) => g.id === id)! as unknown as GameDay;
const playerRow = (id: number) => db.store.player.find((p) => p.id === id) as unknown as Player;
const voteOf = (gameDayId: number, playerId: number) => votesOf(db, gameDayId).find((v) => v.playerId === playerId) ?? null;
const entryOf = (gameDayId: number, playerId: number) => openSlotsOf(db, gameDayId).find((s) => s.playerId === playerId) ?? null;
const activeOf = (gameDayId: number) => nominationsOf(db, gameDayId).filter((n) => n.endedAt === null);
const countsOf = async (gameDayId: number) => computeGameDayCounts(await loadGameDayState(db as never, gameDayRow(gameDayId)));

describe('nominate', () => {
  it('passes a holder\'s slot on: their vote goes IN, the nominee leaves the waiting list, and no count moves', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    seedVote(db, gd.id, ada.id, 'IN');
    seedOpenSlot(db, gd.id, bob.id, { status: 'WAITING' });
    const before = await countsOf(gd.id);

    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    expect(activeOf(gd.id)).toEqual([expect.objectContaining({ nominatorPlayerId: ada.id, nomineePlayerId: bob.id })]);
    expect(voteOf(gd.id, ada.id)).toMatchObject({ choice: 'IN' });
    // Deleted, not WITHDRAWN - WITHDRAWN is terminal, and Bob gave nothing back.
    expect(entryOf(gd.id, bob.id)).toBeNull();
    const after = await countsOf(gd.id);
    expect(after.slotsHeld).toBe(before.slotsHeld);
    expect(after.confirmedIn).toBe(before.confirmedIn);
    const state = await loadGameDayState(db as never, gameDayRow(gd.id));
    expect(state.openSlotPoolIds.has(bob.id)).toBe(false);
  });

  it('sets the nominator\'s vote IN from OUT and from no vote at all', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const cy = fulltime(db, 'cy');
    const bob = openSlotPlayer(db, 'bob');
    const dee = openSlotPlayer(db, 'dee');
    seedVote(db, gd.id, ada.id, 'OUT');

    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    await nominate(1, gd.id, cy.id, dee.id, T.beforeClose);

    expect(voteOf(gd.id, ada.id)).toMatchObject({ choice: 'IN' });
    expect(voteOf(gd.id, cy.id)).toMatchObject({ choice: 'IN' });
  });

  it('only lets a fulltime player holding their own slot nominate', async () => {
    const gd = seedGameDay(db);
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    const openSlot = openSlotPlayer(db, 'os');
    const bob = openSlotPlayer(db, 'bob');
    seedReplacement(db, owner.id, filler.id, GAME_DATE, '2026-10-07');

    const refusal = /Only a fulltime player holding their own slot/;
    await expect(nominate(1, gd.id, owner.id, bob.id, T.beforeClose)).rejects.toThrow(refusal);
    await expect(nominate(1, gd.id, filler.id, bob.id, T.beforeClose)).rejects.toThrow(refusal);
    await expect(nominate(1, gd.id, openSlot.id, bob.id, T.beforeClose)).rejects.toThrow(refusal);
    expect(nominationsOf(db, gd.id)).toEqual([]);
  });

  it('resolves the owner\'s eligibility against the game date, not today', async () => {
    vi.setSystemTime(T.twoDaysBefore);
    const gd = seedGameDay(db);
    const starts = fulltime(db, 'starts');
    const ended = fulltime(db, 'ended');
    const f1 = openSlotPlayer(db, 'f1');
    const f2 = openSlotPlayer(db, 'f2');
    const bob = openSlotPlayer(db, 'bob');
    const cy = openSlotPlayer(db, 'cy');
    // Active on the game date, not today: blocks. Active today, not on the game date: does not.
    seedReplacement(db, starts.id, f1.id, GAME_DATE, '2026-10-07');
    seedReplacement(db, ended.id, f2.id, '2026-09-07', '2026-09-21');

    await expect(nominate(1, gd.id, starts.id, bob.id, T.twoDaysBefore)).rejects.toThrow(/fulltime player holding their own slot/);
    await nominate(1, gd.id, ended.id, cy.id, T.twoDaysBefore);
    expect(activeOf(gd.id)).toHaveLength(1);
  });

  it('only accepts a nominee from this game day\'s open-slot pool', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const other = fulltime(db, 'other');
    const owner = fulltime(db, 'owner');
    const filler = openSlotPlayer(db, 'filler');
    const disabled = openSlotPlayer(db, 'gone', { playerStatus: 'DISABLED' });
    seedReplacement(db, owner.id, filler.id, GAME_DATE, '2026-10-07');

    const refusal = /open-slot player who has no slot/;
    await expect(nominate(1, gd.id, ada.id, other.id, T.beforeClose)).rejects.toThrow(refusal);
    await expect(nominate(1, gd.id, ada.id, filler.id, T.beforeClose)).rejects.toThrow(refusal);
    await expect(nominate(1, gd.id, ada.id, disabled.id, T.beforeClose)).rejects.toThrow(refusal);
    await expect(nominate(1, gd.id, ada.id, ada.id, T.beforeClose)).rejects.toThrow(refusal);
  });

  it('gives one nominee to one slot - two nominators racing for the same player leave one nomination', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const cy = fulltime(db, 'cy');
    const bob = openSlotPlayer(db, 'bob');

    const results = await Promise.allSettled([
      nominate(1, gd.id, ada.id, bob.id, T.beforeClose),
      nominate(1, gd.id, cy.id, bob.id, T.beforeClose),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toMatch(/bob is already playing in someone else's slot/);
    expect(activeOf(gd.id)).toHaveLength(1);
  });

  it('switches in one transaction, and re-nominating the same person is a no-op', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const carol = openSlotPlayer(db, 'carol');

    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    expect(nominationsOf(db, gd.id)).toHaveLength(1);

    await nominate(1, gd.id, ada.id, carol.id, T.beforeClose);
    const rows = nominationsOf(db, gd.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ nomineePlayerId: bob.id, endReason: 'SWITCHED' });
    expect(rows[1]).toMatchObject({ nomineePlayerId: carol.id, endedAt: null });
  });

  it('closes at 13:00 itself, even while the status still reads VOTING_OPEN (the tick lag)', async () => {
    const gd = seedGameDay(db); // still VOTING_OPEN - no tick has closed it yet
    const ada = fulltime(db, 'ada');
    const cy = fulltime(db, 'cy');
    const bob = openSlotPlayer(db, 'bob');
    const carol = openSlotPlayer(db, 'carol');
    const dee = openSlotPlayer(db, 'dee');
    await nominate(1, gd.id, cy.id, dee.id, T.beforeClose);

    await expect(nominate(1, gd.id, ada.id, bob.id, T.atClose)).rejects.toThrow(/Voting has closed/);
    await expect(nominate(1, gd.id, cy.id, carol.id, T.atClose)).rejects.toThrow(/Voting has closed/);
    await expect(revokeNomination(1, gd.id, cy.id, T.atClose)).rejects.toThrow(/Voting has closed/);
    expect(activeOf(gd.id)).toEqual([expect.objectContaining({ nominatorPlayerId: cy.id, nomineePlayerId: dee.id })]);
  });
});

describe('revoke and the way back to the waiting list', () => {
  it('keeps the nominator IN, and the former nominee rejoins the waiting list at the back', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const early = openSlotPlayer(db, 'early');
    seedOpenSlot(db, gd.id, bob.id, { joinedAt: new Date('2026-09-21T09:00:00Z') });
    seedOpenSlot(db, gd.id, early.id, { joinedAt: new Date('2026-09-21T12:00:00Z') });

    await nominate(1, gd.id, ada.id, bob.id, T.beforePing);
    await revokeNomination(1, gd.id, ada.id, T.beforeClose);

    expect(nominationsOf(db, gd.id)[0]).toMatchObject({ endReason: 'REVOKED' });
    expect(voteOf(gd.id, ada.id)).toMatchObject({ choice: 'IN' });
    await joinOpenSlot(1, gd.id, bob.id, T.beforeClose);
    const waiting = openSlotsOf(db, gd.id).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    expect(waiting.map((s) => s.playerId)).toEqual([early.id, bob.id]);
  });

  it('refuses a revoke with nothing to revoke', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    await expect(revokeNomination(1, gd.id, ada.id, T.beforeClose)).rejects.toThrow(/have not passed your slot on/);
  });
});

describe('the nominee has no say of their own', () => {
  it('cannot vote, and is told who holds the vote - not "only open-slot players"', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    const refusal = "ada holds the vote for this slot - tell ada if you can't make it";
    await expect(castVote(1, gd.id, bob.id, 'OUT', T.beforeClose)).rejects.toThrow(refusal);
    await expect(joinOpenSlot(1, gd.id, bob.id, T.beforeClose)).rejects.toThrow(refusal);

    const view = await getGameDayView(gameDayRow(gd.id), playerRow(bob.id), T.beforeClose);
    expect(view.role).toBe('NOMINEE');
    expect(view.nomination.standingInFor).toEqual({ id: ada.id, name: 'ada' });
    expect(view.actions.voteOut).toEqual({ ok: false, reason: refusal });
    expect(view.actions.joinWaitingList).toEqual({ ok: false, reason: refusal });
    expect(view.rosterVisible).toBe(true);
  });

  it('is never promoted from the waiting list', async () => {
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 14);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const grace = openSlotPlayer(db, 'grace');
    seedOpenSlot(db, gd.id, bob.id);
    seedOpenSlot(db, gd.id, grace.id);
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose); // 15 held

    await closeVoting(gd.id, T.atClose);

    expect(entryOf(gd.id, bob.id)).toBeNull();
    expect(entryOf(gd.id, grace.id)).toMatchObject({ status: 'ASSIGNED' });
  });
});

describe('an OUT voids the hand-off', () => {
  it('before 13:00: ended NOMINATOR_OUT, and a later IN is the nominator, not the nominee', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforePing);

    await castVote(1, gd.id, ada.id, 'OUT', T.afterPing);
    await castVote(1, gd.id, ada.id, 'IN', T.afterReminder);

    expect(nominationsOf(db, gd.id)[0]).toMatchObject({ endReason: 'NOMINATOR_OUT' });
    expect(activeOf(gd.id)).toEqual([]);
    const attendance = await getGameDayAttendance(gameDayRow(gd.id));
    expect(attendance.confirmed.map((p) => p.id)).toEqual([ada.id]);
  });

  it('after 13:00: the vacancy goes to the waiting list, and the ex-nominee gets no WAITING row back', async () => {
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 15);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const grace = openSlotPlayer(db, 'grace');
    seedOpenSlot(db, gd.id, grace.id);
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose); // 16 held - full
    await closeVoting(gd.id, T.atClose);
    expect(entryOf(gd.id, grace.id)).toMatchObject({ status: 'WAITING' });

    await castVote(1, gd.id, ada.id, 'OUT', T.afterClose);

    expect(nominationsOf(db, gd.id)[0]).toMatchObject({ endReason: 'NOMINATOR_OUT' });
    expect(entryOf(gd.id, grace.id)).toMatchObject({ status: 'ASSIGNED', source: 'WAITING_LIST' });
    expect(entryOf(gd.id, bob.id)).toBeNull();
    // A closed vote has no queue: Bob's join is a direct claim, and the slot has just gone to Grace.
    await expect(joinOpenSlot(1, gd.id, bob.id, T.afterClose)).rejects.toThrow(/No open slots available/);
  });

  it('after 13:00 with nobody waiting, the ex-nominee can direct-claim the leftover slot', async () => {
    const gd = seedGameDay(db);
    fulltimeIn(db, gd.id, 15);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    await closeVoting(gd.id, T.atClose);

    await castVote(1, gd.id, ada.id, 'OUT', T.afterClose);
    await joinOpenSlot(1, gd.id, bob.id, T.afterClose);

    expect(entryOf(gd.id, bob.id)).toMatchObject({ status: 'ASSIGNED', source: 'DIRECT' });
  });
});

describe('other ways a nomination ends', () => {
  it('an admin release of the nominator ends it ADMIN_RELEASE', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    await releaseSlot(1, gd.id, ada.id, T.beforeClose);

    expect(nominationsOf(db, gd.id)[0]).toMatchObject({ endReason: 'ADMIN_RELEASE' });
    expect(voteOf(gd.id, ada.id)).toBeNull();
  });

  it('a disabled nominee ends it PLAYER_DISABLED and takes the nominator\'s IN with them', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    await removeDisabledPlayerFromGameDays(1, bob.id);

    expect(nominationsOf(db, gd.id)[0]).toMatchObject({ endReason: 'PLAYER_DISABLED' });
    expect(voteOf(gd.id, ada.id)).toBeNull();
  });

  it('a skip-date cancellation (through cancelGameDay, not only the disable path) ends it GAME_DAY_CANCELLED', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforePing);
    db.store.squad[0].schedule = { ...WEDNESDAY_SCHEDULE, skipDates: [GAME_DATE] };

    await runGameDayTick(T.afterPing);

    expect(gameDayRow(gd.id).status).toBe('CANCELLED');
    expect(nominationsOf(db, gd.id)[0]).toMatchObject({ endReason: 'GAME_DAY_CANCELLED' });
  });

  it('re-creating a cancelled game day deletes its nominations with its votes', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforePing);
    await cancelGameDay(gd.id, 'rain', T.beforePing);

    await runGameDayTick(T.afterPing);

    expect(gameDayRow(gd.id).status).toBe('VOTING_OPEN');
    expect(nominationsOf(db, gd.id)).toEqual([]);
    expect(votesOf(db, gd.id)).toEqual([]);
  });

  it('a cancelled day that already has a Game is not re-created, and holds no active nomination', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforePing);
    db.insert('game', { id: 'g1', squadId: 1, gameDayId: gd.id });
    await cancelGameDay(gd.id, 'rain', T.beforePing);

    await runGameDayTick(T.afterPing);

    expect(gameDayRow(gd.id).status).toBe('CANCELLED');
    expect(activeOf(gd.id)).toEqual([]);
  });

  it('ends SESSION_ENDED once the session is over - and not a minute before', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    await runGameDayTick(new Date('2026-09-23T19:59:00Z')); // 21:59 Amsterdam, session ends 22:00
    expect(activeOf(gd.id)).toHaveLength(1);

    const summary = await runGameDayTick(T.afterSession);
    expect(summary.nominationsEnded).toBe(1);
    expect(nominationsOf(db, gd.id)[0]).toMatchObject({ endReason: 'SESSION_ENDED' });
  });
});

describe('the roster swap lives in buildRoster', () => {
  it('Game Planner\'s confirmed list holds the nominee, not the nominator (what the Elo run scores)', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const cy = fulltime(db, 'cy');
    const bob = openSlotPlayer(db, 'bob');
    seedVote(db, gd.id, cy.id, 'IN');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    await closeVoting(gd.id, T.atClose);

    const attendance = await getGameDayAttendance(gameDayRow(gd.id));

    expect(attendance.confirmed.map((p) => p.id).sort()).toEqual([bob.id, cy.id].sort());
    expect(attendance.confirmed.find((p) => p.id === bob.id)?.standingInFor).toEqual({ id: ada.id, name: 'ada' });
    expect(attendance.counts.confirmedIn).toBe(2);
    expect(attendance.nominations).toEqual([
      expect.objectContaining({ nominatorName: 'ada', nomineeName: 'bob', endReason: null }),
    ]);
  });

  it('still swaps for a hand-off that ran its course, but not for a revoked one', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const cy = fulltime(db, 'cy');
    const bob = openSlotPlayer(db, 'bob');
    const dee = openSlotPlayer(db, 'dee');
    seedVote(db, gd.id, ada.id, 'IN');
    seedVote(db, gd.id, cy.id, 'IN');
    seedNomination(db, gd.id, ada.id, bob.id, { endedAt: T.afterSession, endReason: 'SESSION_ENDED' });
    seedNomination(db, gd.id, cy.id, dee.id, { endedAt: T.beforeClose, endReason: 'REVOKED' });

    const attendance = await getGameDayAttendance(gameDayRow(gd.id));

    expect(attendance.confirmed.map((p) => p.id).sort()).toEqual([bob.id, cy.id].sort());
  });

  it('the nominator\'s own view shows the hand-off', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    const view = await getGameDayView(gameDayRow(gd.id), playerRow(ada.id), T.beforeClose);
    expect(view.role).toBe('VOTER');
    expect(view.myVote).toBe('IN');
    expect(view.nomination.mine).toEqual({ nomineeId: bob.id, nomineeName: 'bob' });
    expect(view.actions.nominate).toEqual({ ok: true });
    const after = await getGameDayView(gameDayRow(gd.id), playerRow(ada.id), T.atClose);
    expect(after.actions.nominate.ok).toBe(false);
  });
});

describe('a colliding period replacement is rejected (Decision 7)', () => {
  const window = (owner: { id: number; email: string }, filler: { id: number }) =>
    createSlotReplacement(1, {
      fulltimePlayerId: owner.id,
      replacementPlayerId: filler.id,
      startDate: GAME_DATE,
      endDate: '2026-10-07',
      createdByEmail: owner.email,
    });

  it('says "revoke" while the hand-off can still be changed, and succeeds once it is revoked', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const filler = openSlotPlayer(db, 'filler');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    await expect(window(ada, filler)).rejects.toThrow(/passed your slot for Wednesday 23 Sep to bob - revoke that first/);
    expect(db.store.slotReplacement).toEqual([]);

    await revokeNomination(1, gd.id, ada.id, T.beforeClose);
    await window(ada, filler);
    expect(db.store.slotReplacement).toHaveLength(1);
  });

  it('says "locked in" after 13:00 rather than suggesting an impossible revoke', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const filler = openSlotPlayer(db, 'filler');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    await closeVoting(gd.id, T.atClose);
    vi.setSystemTime(T.afterClose);

    await expect(window(ada, filler)).rejects.toThrow(/Your hand-off to bob is already locked in for Wednesday 23 Sep/);
  });

  it('rejects a window whose replacement player is someone\'s nominee', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const owner = fulltime(db, 'owner');
    const bob = openSlotPlayer(db, 'bob');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);

    await expect(window(owner, bob)).rejects.toThrow(/bob is playing in ada's slot on Wednesday 23 Sep - ada has to revoke that first/);
  });

  it('stops blocking once the session is over - before the scheduler has stamped it, and after', async () => {
    const gd = seedGameDay(db);
    const ada = fulltime(db, 'ada');
    const bob = openSlotPlayer(db, 'bob');
    const filler = openSlotPlayer(db, 'filler');
    await nominate(1, gd.id, ada.id, bob.id, T.beforeClose);
    vi.setSystemTime(T.afterSession);

    expect(activeOf(gd.id)).toHaveLength(1); // not stamped yet - an outage, say
    await window(ada, filler);
    expect(db.store.slotReplacement).toHaveLength(1);
  });
});
