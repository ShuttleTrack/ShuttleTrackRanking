import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const client = {
    squad: { findMany: vi.fn() },
    player: { findMany: vi.fn(), groupBy: vi.fn() },
    squadJoinRequest: { findMany: vi.fn() },
  };
  return { default: client };
});

import prisma from '@/lib/prisma';
import { formatScheduleSummary, listOpenSquads } from './squadDirectory';

type Mock = ReturnType<typeof vi.fn>;
const mocked = prisma as unknown as {
  squad: { findMany: Mock };
  player: { findMany: Mock; groupBy: Mock };
  squadJoinRequest: { findMany: Mock };
};

const EMAIL = 'me@example.com';
const squad = { id: 1, name: 'Wednesday', slug: 'wed', maxPlayers: null, schedule: null };

function player(playerStatus: string | null) {
  return { id: 7, squadId: 1, email: EMAIL, playerStatus };
}

beforeEach(() => {
  mocked.squad.findMany.mockReset().mockResolvedValue([squad]);
  mocked.player.findMany.mockReset().mockResolvedValue([]);
  mocked.player.groupBy.mockReset().mockResolvedValue([{ squadId: 1, _count: 3 }]);
  mocked.squadJoinRequest.findMany.mockReset().mockResolvedValue([]);
});

describe('listOpenSquads membership', () => {
  it('is "none" with no player row and no pending request', async () => {
    const [row] = await listOpenSquads(EMAIL);
    expect(row.membership).toBe('none');
  });

  it('is "pending" when a request is outstanding', async () => {
    mocked.squadJoinRequest.findMany.mockResolvedValue([{ squadId: 1 }]);
    const [row] = await listOpenSquads(EMAIL);
    expect(row.membership).toBe('pending');
  });

  it('is "member" for an ACTIVE player', async () => {
    mocked.player.findMany.mockResolvedValue([player('ACTIVE')]);
    const [row] = await listOpenSquads(EMAIL);
    expect(row.membership).toBe('member');
  });

  // Regression: addPlayer leaves playerStatus null until a player's first processed game, and a
  // scoreless open-slot player stays there indefinitely - so this is the *normal* state right
  // after an approval, not an edge case. Deriving membership with !isActive() told someone who
  // had just been approved they were "on the roster (inactive)".
  it('is "member", not "memberInactive", for a just-approved player with a null status', async () => {
    mocked.player.findMany.mockResolvedValue([player(null)]);
    const [row] = await listOpenSquads(EMAIL);
    expect(row.membership).toBe('member');
  });

  it('is "member" for the ENABLED string too', async () => {
    mocked.player.findMany.mockResolvedValue([player('ENABLED')]);
    const [row] = await listOpenSquads(EMAIL);
    expect(row.membership).toBe('member');
  });

  it('is "memberInactive" only for a DISABLED player', async () => {
    mocked.player.findMany.mockResolvedValue([player('DISABLED')]);
    const [row] = await listOpenSquads(EMAIL);
    expect(row.membership).toBe('memberInactive');
  });

  it('a player row wins over a stray pending request', async () => {
    mocked.player.findMany.mockResolvedValue([player('ACTIVE')]);
    mocked.squadJoinRequest.findMany.mockResolvedValue([{ squadId: 1 }]);
    const [row] = await listOpenSquads(EMAIL);
    expect(row.membership).toBe('member');
  });

  it('lowercases the caller email before matching', async () => {
    await listOpenSquads('  ME@Example.COM ');
    expect(mocked.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: EMAIL }) })
    );
  });

  it('short-circuits without further queries when no squad is open', async () => {
    mocked.squad.findMany.mockResolvedValue([]);
    expect(await listOpenSquads(EMAIL)).toEqual([]);
    expect(mocked.player.findMany).not.toHaveBeenCalled();
  });
});

// Squad.schedule is nullable and may carry isRecurring: false, so the card needs a real empty
// state rather than a blank line.
describe('formatScheduleSummary', () => {
  it('returns null for a squad with no schedule', () => {
    expect(formatScheduleSummary(null)).toBeNull();
  });

  it('returns null for an explicitly non-recurring schedule', () => {
    expect(formatScheduleSummary({ isRecurring: false, dayOfWeek: 'WEDNESDAY' })).toBeNull();
  });

  it('returns null when recurring but the day was never set', () => {
    expect(formatScheduleSummary({ isRecurring: true, dayOfWeek: null })).toBeNull();
  });

  it('formats a full day + time range', () => {
    expect(
      formatScheduleSummary({
        isRecurring: true,
        dayOfWeek: 'WEDNESDAY',
        startTime: '19:00',
        endTime: '21:00',
      })
    ).toBe('Wednesdays 19:00–21:00');
  });

  it('falls back to a start time alone, then to the day alone', () => {
    expect(
      formatScheduleSummary({ isRecurring: true, dayOfWeek: 'FRIDAY', startTime: '18:30' })
    ).toBe('Fridays from 18:30');
    expect(formatScheduleSummary({ isRecurring: true, dayOfWeek: 'FRIDAY' })).toBe('Fridays');
  });
});
