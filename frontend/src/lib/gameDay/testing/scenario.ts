// Seeding helpers for the game-day tests: one Wednesday squad, a 19:00-22:00 Amsterdam session
// on 2026-09-23, and named instants around its deadlines. Not a test file itself.
import type { FakePrisma } from './fakePrisma';
import { dateOnlyFromIso } from '../clock';
import { resolveGameDayInstants } from '../voteWindow';

export const SQUAD_ID = 1;
export const AMS = 'Europe/Amsterdam';
export const GAME_DATE = '2026-09-23'; // a Wednesday

// Around the 2026-09-23 session (CEST, UTC+2): 09:00 ping = 07:00Z, 10:00 reminder = 08:00Z,
// 13:00 deadline = 11:00Z, 17:00 slot lock (start - 2h) = 15:00Z, 19:00 start = 17:00Z.
export const T = {
  twoDaysBefore: new Date('2026-09-21T10:00:00Z'),
  beforePing: new Date('2026-09-23T06:30:00Z'),
  afterPing: new Date('2026-09-23T07:05:00Z'),
  afterReminder: new Date('2026-09-23T08:05:00Z'),
  beforeClose: new Date('2026-09-23T10:30:00Z'),
  atClose: new Date('2026-09-23T11:04:00Z'),
  afterClose: new Date('2026-09-23T12:00:00Z'),
  afterLock: new Date('2026-09-23T15:30:00Z'),
  afterSession: new Date('2026-09-23T20:30:00Z'),
};

export const WEDNESDAY_SCHEDULE = {
  isRecurring: true,
  dayOfWeek: 'WEDNESDAY',
  startTime: '19:00',
  endTime: '22:00',
  startDate: '2026-01-01',
  endDate: null,
  skipDates: [] as string[],
  timezone: AMS,
};

export const OPS = {
  enabled: true,
  voteOpensDaysBefore: 2,
  minPlayersForOpenSlot: 16,
  telegramMainChatId: '-100111',
  telegramOpenSlotChatId: '-100222',
};

export function seedSquad(db: FakePrisma, overrides: Record<string, unknown> = {}) {
  return db.insert('squad', {
    id: SQUAD_ID,
    name: 'Wednesday Squad',
    slug: 'wed',
    schedule: WEDNESDAY_SCHEDULE,
    gameDayOps: OPS,
    ...overrides,
  });
}

let nextPlayerId = 100;
export function resetIds() {
  nextPlayerId = 100;
}

export function fulltime(db: FakePrisma, name: string, extra: Record<string, unknown> = {}) {
  return db.insert('player', { id: ++nextPlayerId, squadId: SQUAD_ID, name, email: `${name}@x.test`, playerType: 'FULLTIME', ...extra });
}

export function openSlotPlayer(db: FakePrisma, name: string, extra: Record<string, unknown> = {}) {
  return db.insert('player', { id: ++nextPlayerId, squadId: SQUAD_ID, name, email: `${name}@x.test`, playerType: 'OPEN_SLOT', ...extra });
}

export function seedGameDay(db: FakePrisma, overrides: Record<string, unknown> = {}) {
  const gameDate = (overrides.gameDate as string | undefined) ?? GAME_DATE;
  const clock = {
    gameDate,
    startTime: (overrides.startTime as string) ?? '19:00',
    endTime: (overrides.endTime as string) ?? '22:00',
    timezone: (overrides.timezone as string) ?? AMS,
  };
  const { votesCloseAt, slotLockAt } = resolveGameDayInstants(clock);
  return db.insert('gameDay', {
    squadId: SQUAD_ID,
    ...clock,
    minPlayers: 16,
    votesCloseAt,
    slotLockAt,
    ...overrides,
    gameDate: dateOnlyFromIso(gameDate),
  });
}

export function seedVote(
  db: FakePrisma,
  gameDayId: number,
  playerId: number,
  choice: 'IN' | 'OUT' | null,
  extra: Record<string, unknown> = {}
) {
  return db.insert('gameDayVote', { gameDayId, playerId, choice, ...extra });
}

export function seedOpenSlot(db: FakePrisma, gameDayId: number, playerId: number, extra: Record<string, unknown> = {}) {
  return db.insert('gameDayOpenSlot', { gameDayId, playerId, ...extra });
}

export function seedReplacement(db: FakePrisma, ownerId: number, fillerId: number, start: string, end: string, extra: Record<string, unknown> = {}) {
  return db.insert('slotReplacement', {
    squadId: SQUAD_ID,
    fulltimePlayerId: ownerId,
    replacementPlayerId: fillerId,
    startDate: dateOnlyFromIso(start),
    endDate: dateOnlyFromIso(end),
    createdByEmail: 'owner@x.test',
    ...extra,
  });
}

// n fulltime players who have all voted IN on the given game day.
export function fulltimeIn(db: FakePrisma, gameDayId: number, n: number, prefix = 'ft') {
  return Array.from({ length: n }, (_, i) => {
    const p = fulltime(db, `${prefix}${i + 1}`);
    seedVote(db, gameDayId, p.id, 'IN');
    return p;
  });
}

export function votesOf(db: FakePrisma, gameDayId: number) {
  return db.store.gameDayVote.filter((v) => v.gameDayId === gameDayId);
}

export function openSlotsOf(db: FakePrisma, gameDayId: number) {
  return db.store.gameDayOpenSlot.filter((s) => s.gameDayId === gameDayId);
}
