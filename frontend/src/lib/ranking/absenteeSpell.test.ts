import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocking @/lib/prisma follows the existing vi.mock pattern in lib/auth/validateUserAccess.test.ts
// (hoisted above the imports, so the static import below picks up the mock). These functions are
// almost entirely *query shape* - the sentinel-row exclusion and the date window are expressed in
// the `where` clauses and nowhere else - so a couple of the assertions below deliberately check
// the query the code builds, which is the only place that logic lives.
vi.mock('@/lib/prisma', () => ({
  default: {
    scoreHistory: { findFirst: vi.fn() },
    encounter: { groupBy: vi.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { absenteeSpellDays, gameDaysSinceLastPlay, effectiveSpellStart } from './absenteeSpell';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const findFirst = prisma.scoreHistory.findFirst as unknown as ReturnType<typeof vi.fn>;
const groupBy = prisma.encounter.groupBy as unknown as ReturnType<typeof vi.fn>;

function lastPlayedOn(date: string | null) {
  findFirst.mockResolvedValue(date ? { encounterDate: d(date) } : null);
}

function gameDaysReturned(count: number) {
  groupBy.mockResolvedValue(Array.from({ length: count }, (_, i) => ({ encounterDate: d(`2026-10-0${i + 1}`) })));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('effectiveSpellStart (the clamp rule, pure)', () => {
  it('is the last play date when no clamp is given', () => {
    expect(effectiveSpellStart(d('2026-09-02'))).toEqual(d('2026-09-02'));
  });

  it('is null when the player has never played and no clamp is given', () => {
    expect(effectiveSpellStart(null)).toBeNull();
  });

  it('falls back to the clamp when the player has never played', () => {
    // The day *before* the window start, because the bound is exclusive - so the window's own
    // first game day still counts as missed.
    expect(effectiveSpellStart(null, d('2026-10-07'))).toEqual(d('2026-10-06'));
  });

  it('a clamp later than the last play wins - pre-window dormancy cannot pre-load the ramp', () => {
    // The regression guard from OPEN_SLOT_PLAYERS_PLAN.md: a long-dormant nominee would otherwise
    // arrive at their own window already at the 3x step.
    expect(effectiveSpellStart(d('2026-05-06'), d('2026-10-07'))).toEqual(d('2026-10-06'));
  });

  it('a clamp earlier than the last play is a no-op', () => {
    expect(effectiveSpellStart(d('2026-10-14'), d('2026-10-07'))).toEqual(d('2026-10-14'));
  });

  it('playing on the window start date itself wins over the clamp', () => {
    expect(effectiveSpellStart(d('2026-10-07'), d('2026-10-07'))).toEqual(d('2026-10-07'));
  });
});

describe('absenteeSpellDays', () => {
  it('returns null - not 0 - when the player has never played and there is no clamp', async () => {
    lastPlayedOn(null);
    expect(await absenteeSpellDays(1, 42, d('2026-10-21'))).toBeNull();
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('excludes the -1/-2/-3 absentee/deactivate/activate sentinels when finding the last real play', async () => {
    lastPlayedOn('2026-09-02');
    gameDaysReturned(0);
    await absenteeSpellDays(1, 42, d('2026-10-21'));
    expect(findFirst).toHaveBeenCalledWith({
      where: { playerId: 42, encounterId: { gt: 0 } },
      orderBy: { encounterDate: 'desc' },
    });
  });

  it('counts distinct processed squad game days strictly after the last play, up to asOf', async () => {
    lastPlayedOn('2026-09-02');
    gameDaysReturned(3);

    expect(await absenteeSpellDays(7, 42, d('2026-10-21'))).toBe(3);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['encounterDate'],
      where: {
        squadId: 7,
        processed: true,
        encounterDate: { gt: d('2026-09-02'), lte: d('2026-10-21') },
      },
    });
  });

  it('counts from the clamp when the player was dormant before the window', async () => {
    lastPlayedOn('2026-05-06');
    gameDaysReturned(1);

    expect(await absenteeSpellDays(7, 42, d('2026-10-07'), d('2026-10-07'))).toBe(1);
    // Only the window's own game days are in range - the months of dormancy before it are not.
    expect(groupBy.mock.calls[0][0].where.encounterDate).toEqual({
      gt: d('2026-10-06'),
      lte: d('2026-10-07'),
    });
  });

  it('still counts from the last play when that falls inside the window (playing resets the ramp)', async () => {
    lastPlayedOn('2026-10-14');
    gameDaysReturned(1);

    await absenteeSpellDays(7, 42, d('2026-10-21'), d('2026-10-07'));
    expect(groupBy.mock.calls[0][0].where.encounterDate.gt).toEqual(d('2026-10-14'));
  });

  it('counts the clamped window even for a player who has never played at all', async () => {
    lastPlayedOn(null);
    gameDaysReturned(2);

    expect(await absenteeSpellDays(7, 42, d('2026-10-14'), d('2026-10-07'))).toBe(2);
  });
});

describe('gameDaysSinceLastPlay', () => {
  it('is absenteeSpellDays with no clamp', async () => {
    lastPlayedOn('2026-09-02');
    gameDaysReturned(4);

    expect(await gameDaysSinceLastPlay(7, 42, d('2026-10-21'))).toBe(4);
    expect(groupBy.mock.calls[0][0].where.encounterDate.gt).toEqual(d('2026-09-02'));
  });

  it('returns null for a player who has never played', async () => {
    lastPlayedOn(null);
    expect(await gameDaysSinceLastPlay(7, 42, d('2026-10-21'))).toBeNull();
  });
});
