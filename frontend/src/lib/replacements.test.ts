import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above the imports, so the static import below picks up the mock (same
// pattern as lib/auth/validateUserAccess.test.ts). $transaction is given the real interactive
// shape - it hands the callback a client, so the overlap check and the insert inside it run
// exactly as they do against a real Prisma client.
vi.mock('@/lib/prisma', () => {
  const client = {
    player: { findUnique: vi.fn(), findMany: vi.fn() },
    squad: { findUniqueOrThrow: vi.fn() },
    slotReplacement: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  };
  return { default: client };
});

import prisma from '@/lib/prisma';
import {
  createSlotReplacement,
  shortenSlotReplacement,
  previewReplacementWindow,
  searchOpenSlotPlayers,
  maxEndDateFor,
  MAX_REPLACEMENT_MONTHS,
} from './replacements';

const mocked = prisma as unknown as {
  player: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  squad: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  slotReplacement: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

// "Today" is pinned so the not-already-passed rule below is tested against a fixed clock rather
// than drifting into failure as real time moves past the fixture dates.
const TODAY = '2026-09-21';

const OWNER_EMAIL = 'owner@example.com';

const owner = { id: 5, squadId: 1, email: OWNER_EMAIL, playerType: 'FULLTIME' };
const nominee = { id: 6, squadId: 1, email: 'filler@example.com', playerType: 'OPEN_SLOT' };

// A recurring Wednesday squad, so 2026-10-07 .. 2026-10-21 is exactly 3 playing days.
const recurringSchedule = {
  isRecurring: true,
  dayOfWeek: 'WEDNESDAY',
  startTime: '19:00',
  endTime: '21:00',
  startDate: '2026-01-01',
  endDate: null,
  skipDates: [] as string[],
};

function givenSquad(schedule: unknown) {
  mocked.squad.findUniqueOrThrow.mockResolvedValue({ id: 1, schedule });
}

function givenPlayers(fulltime: unknown, replacement: unknown) {
  mocked.player.findUnique.mockImplementation(({ where: { id } }: { where: { id: number } }) =>
    Promise.resolve(id === 5 ? fulltime : id === 6 ? replacement : null)
  );
}

function nominate(overrides: Partial<Parameters<typeof createSlotReplacement>[1]> = {}) {
  return createSlotReplacement(1, {
    fulltimePlayerId: 5,
    replacementPlayerId: 6,
    startDate: '2026-10-07',
    endDate: '2026-10-21',
    createdByEmail: OWNER_EMAIL,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
  givenPlayers(owner, nominee);
  givenSquad(recurringSchedule);
  mocked.slotReplacement.findFirst.mockResolvedValue(null);
  mocked.slotReplacement.create.mockImplementation(({ data }: { data: unknown }) =>
    Promise.resolve({ id: 99, ...(data as object) })
  );
});

describe('createSlotReplacement input guards (no DB access reached)', () => {
  it('rejects a player nominating themselves', async () => {
    await expect(nominate({ replacementPlayerId: 5 })).rejects.toThrow('cannot replace themselves');
  });

  it('rejects an end date before the start date', async () => {
    await expect(nominate({ startDate: '2026-10-21', endDate: '2026-10-07' })).rejects.toThrow(
      'End date must be on or after the start date'
    );
  });
});

describe('createSlotReplacement maximum duration', () => {
  it(`rejects a window longer than ${MAX_REPLACEMENT_MONTHS} months`, async () => {
    await expect(nominate({ startDate: '2026-10-07', endDate: '2027-02-08' })).rejects.toThrow(
      `at most ${MAX_REPLACEMENT_MONTHS} months`
    );
    expect(mocked.slotReplacement.create).not.toHaveBeenCalled();
  });

  it('accepts a window of exactly the maximum', async () => {
    await expect(nominate({ startDate: '2026-10-07', endDate: '2027-02-07' })).resolves.toBeTruthy();
  });

  it('rejects the unbounded far-future end date a date input will happily produce', async () => {
    // The reason the cap exists at all: countPlayingDaysBetween walks the range one day at a
    // time, so this used to be a million-iteration request on a single-threaded server.
    await expect(nominate({ endDate: '9999-12-31' })).rejects.toThrow(`at most ${MAX_REPLACEMENT_MONTHS} months`);
  });

  it('rejects a window that is already entirely in the past', async () => {
    await expect(nominate({ startDate: '2026-05-06', endDate: '2026-05-20' })).rejects.toThrow(
      'already passed'
    );
  });

  it('allows a window that started in the past but has not finished', async () => {
    // Covering "from last Wednesday onwards" is a real request; only a window that can never be
    // active is rejected.
    await expect(nominate({ startDate: '2026-09-16', endDate: '2026-10-07' })).resolves.toBeTruthy();
  });

  it('clamps the month arithmetic to the end of the target month rather than rolling over', () => {
    // 31 Oct + 4 months is 28 Feb, not 3 March - the cap is never quietly longer than advertised.
    expect(maxEndDateFor(new Date('2026-10-31T00:00:00.000Z')).toISOString().slice(0, 10)).toBe('2027-02-28');
    // And a leap year still gets its 29th.
    expect(maxEndDateFor(new Date('2027-10-31T00:00:00.000Z')).toISOString().slice(0, 10)).toBe('2028-02-29');
  });
});

describe('createSlotReplacement DB-backed guardrails', () => {
  it('rejects a requester who is not the slot owner', async () => {
    await expect(nominate({ createdByEmail: 'someone.else@example.com' })).rejects.toThrow(
      'only nominate a replacement for your own slot'
    );
  });

  it('matches the owner email case-insensitively', async () => {
    await expect(nominate({ createdByEmail: 'Owner@Example.COM' })).resolves.toBeTruthy();
  });

  it('rejects an owner who is not a fulltime player', async () => {
    givenPlayers({ ...owner, playerType: 'OPEN_SLOT' }, nominee);
    await expect(nominate()).rejects.toThrow('Only a fulltime player has a slot to give away');
  });

  it('rejects a nominee who is not an open-slot player', async () => {
    givenPlayers(owner, { ...nominee, playerType: 'FULLTIME' });
    await expect(nominate()).rejects.toThrow('must be an open-slot player');
  });

  it('rejects a player from another squad', async () => {
    givenPlayers(owner, { ...nominee, squadId: 2 });
    await expect(nominate()).rejects.toThrow('Replacement player not found in this squad');
  });

  it('rejects a squad with no schedule configured', async () => {
    givenSquad(null);
    await expect(nominate()).rejects.toThrow("playing schedule isn't configured yet");
  });

  it('rejects a squad whose schedule is not recurring', async () => {
    givenSquad({ ...recurringSchedule, isRecurring: false });
    await expect(nominate()).rejects.toThrow("playing schedule isn't configured yet");
  });

  it('rejects a range covering fewer than 3 playing days', async () => {
    await expect(nominate({ endDate: '2026-10-14' })).rejects.toThrow('at least 3');
  });

  it('counts the start date itself as a playing day', async () => {
    // 7, 14 and 21 Oct 2026 are Wednesdays - exactly 3, so dropping the start date would
    // wrongly reject this.
    await expect(nominate()).resolves.toBeTruthy();
  });

  it('honours skipDates when counting playing days', async () => {
    givenSquad({ ...recurringSchedule, skipDates: ['2026-10-14'] });
    await expect(nominate()).rejects.toThrow('at least 3');
  });

  it('rejects an overlapping window for either player', async () => {
    mocked.slotReplacement.findFirst.mockResolvedValue({ id: 1 });
    await expect(nominate()).rejects.toThrow('already has an overlapping replacement window');
    expect(mocked.slotReplacement.create).not.toHaveBeenCalled();
  });

  it('checks for overlap on the owner or the nominee, ignoring cancelled windows', async () => {
    await nominate();
    expect(mocked.slotReplacement.findFirst).toHaveBeenCalledWith({
      where: {
        squadId: 1,
        cancelledAt: null,
        OR: [{ fulltimePlayerId: 5 }, { replacementPlayerId: 6 }],
        startDate: { lte: new Date('2026-10-21T00:00:00.000Z') },
        endDate: { gte: new Date('2026-10-07T00:00:00.000Z') },
      },
    });
  });

  it('stores the row with normalised dates and a lowercased creator email', async () => {
    await nominate({ createdByEmail: 'Owner@Example.COM' });
    expect(mocked.slotReplacement.create).toHaveBeenCalledWith({
      data: {
        squadId: 1,
        fulltimePlayerId: 5,
        replacementPlayerId: 6,
        startDate: new Date('2026-10-07T00:00:00.000Z'),
        endDate: new Date('2026-10-21T00:00:00.000Z'),
        createdByEmail: OWNER_EMAIL,
      },
    });
  });
});

describe('shortenSlotReplacement', () => {
  const existing = {
    id: 99,
    squadId: 1,
    startDate: new Date('2026-10-07T00:00:00.000Z'),
    endDate: new Date('2026-12-02T00:00:00.000Z'),
    cancelledAt: null,
    fulltimePlayer: { email: OWNER_EMAIL },
  };

  beforeEach(() => {
    mocked.slotReplacement.findUnique.mockResolvedValue(existing);
    mocked.slotReplacement.update.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve({ ...existing, ...(data as object) })
    );
  });

  it('pulls the end date in', async () => {
    await shortenSlotReplacement(1, 99, OWNER_EMAIL, '2026-10-21');
    expect(mocked.slotReplacement.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { endDate: new Date('2026-10-21T00:00:00.000Z') },
    });
  });

  it('refuses to extend', async () => {
    await expect(shortenSlotReplacement(1, 99, OWNER_EMAIL, '2026-12-30')).rejects.toThrow(
      'only be shortened, not extended'
    );
  });

  it('refuses an end date before the window started', async () => {
    await expect(shortenSlotReplacement(1, 99, OWNER_EMAIL, '2026-10-01')).rejects.toThrow('cancel it instead');
  });

  it('refuses anyone but the nominating player', async () => {
    await expect(shortenSlotReplacement(1, 99, 'someone.else@example.com', '2026-10-21')).rejects.toThrow(
      'Only the nominating player'
    );
  });

  it('refuses an already-cancelled window', async () => {
    mocked.slotReplacement.findUnique.mockResolvedValue({ ...existing, cancelledAt: new Date() });
    await expect(shortenSlotReplacement(1, 99, OWNER_EMAIL, '2026-10-21')).rejects.toThrow('already been cancelled');
  });

  it('does not shorten below the 3-playing-day minimum - shortening only ever reduces a commitment', async () => {
    // Deliberate: outright cancellation is allowed, so a minimum here would be the odd rule out.
    await expect(shortenSlotReplacement(1, 99, OWNER_EMAIL, '2026-10-07')).resolves.toBeTruthy();
  });
});

describe('previewReplacementWindow', () => {
  it('reports the playing days and the dates they resolve to', async () => {
    const preview = await previewReplacementWindow(1, '2026-10-07', '2026-10-21');
    expect(preview.ok).toBe(true);
    expect(preview.playingDays).toBe(3);
    expect(preview.playingDates).toEqual(['2026-10-07', '2026-10-14', '2026-10-21']);
    expect(preview.error).toBeNull();
  });

  it('reports too-few playing days as data, not as a throw', async () => {
    const preview = await previewReplacementWindow(1, '2026-10-07', '2026-10-14');
    expect(preview.ok).toBe(false);
    expect(preview.playingDays).toBe(2);
    expect(preview.error).toContain('at least 3');
  });

  it('surfaces the same max-end-date the create path enforces, so the form can bound its picker', async () => {
    const preview = await previewReplacementWindow(1, '2026-10-07', '2026-10-21');
    expect(preview.maxEndDate).toBe('2027-02-07');
  });

  it('reports a missing schedule rather than throwing', async () => {
    givenSquad(null);
    const preview = await previewReplacementWindow(1, '2026-10-07', '2026-10-21');
    expect(preview.ok).toBe(false);
    expect(preview.error).toContain("isn't configured yet");
  });

  it('rejects an over-long range without walking it', async () => {
    const preview = await previewReplacementWindow(1, '2026-10-07', '9999-12-31');
    expect(preview.ok).toBe(false);
    expect(preview.error).toContain(`at most ${MAX_REPLACEMENT_MONTHS} months`);
  });
});

describe('searchOpenSlotPlayers', () => {
  it('masks the email rather than handing out the real address', async () => {
    mocked.player.findMany.mockResolvedValue([{ id: 6, name: 'grace', email: 'grace@example.com' }]);
    const results = await searchOpenSlotPlayers(1, 'gr');
    expect(results).toEqual([{ id: 6, name: 'grace', maskedEmail: 'g***@example.com' }]);
  });

  it('still matches on the real address server-side', async () => {
    mocked.player.findMany.mockResolvedValue([]);
    await searchOpenSlotPlayers(1, 'grace@example.com');
    expect(mocked.player.findMany.mock.calls[0][0].where.OR).toEqual([
      { name: { contains: 'grace@example.com' } },
      { email: { contains: 'grace@example.com' } },
    ]);
  });

  it('only ever returns open-slot players', async () => {
    mocked.player.findMany.mockResolvedValue([]);
    await searchOpenSlotPlayers(1, 'a');
    expect(mocked.player.findMany.mock.calls[0][0].where.playerType).toBe('OPEN_SLOT');
  });
});
