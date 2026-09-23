import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// ATTENDANCE_VOTE_PLAN.md, "Game - one nullable link": POST /games stamps gameDayId only when the
// game day has no game yet; a second create is a 400 naming the existing game, not a 500.
vi.mock('@/lib/prisma', () => ({
  default: {
    player: { findMany: vi.fn(async () => [{ id: 1, name: 'ada', rankScore: 1000 }]) },
    game: { create: vi.fn(async (args: unknown) => ({ id: 'g1', ...(args as { data: object }).data })) },
    gameDay: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/auth', () => ({ requireSquadAdmin: vi.fn(async () => ({ user: { email: 'admin@x.test' } })) }));
vi.mock('@/lib/api/squadParam', () => ({ parseSquadId: vi.fn(() => 1) }));

import prisma from '@/lib/prisma';
import handler from './index';

const gameDayFind = prisma.gameDay.findUnique as unknown as ReturnType<typeof vi.fn>;
const gameCreate = prisma.game.create as unknown as ReturnType<typeof vi.fn>;

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as NextApiResponse & { statusCode: number; body: any };
}

const post = (body: object) => ({ method: 'POST', body: { groups: { 'Group 1': [1] }, ...body }, query: {} }) as NextApiRequest;

beforeEach(() => vi.clearAllMocks());

describe('POST /games with a gameDayId', () => {
  it('stamps the link on a closed game day with no game yet', async () => {
    gameDayFind.mockResolvedValue({ id: 7, squadId: 1, status: 'VOTING_CLOSED', game: null });
    const res = mockRes();
    await handler(post({ gameDayId: 7 }), res);
    expect(res.statusCode).toBe(201);
    expect(gameCreate.mock.calls[0][0].data.gameDayId).toBe(7);
  });

  it('answers a second create with 400 naming the existing game', async () => {
    gameDayFind.mockResolvedValue({ id: 7, squadId: 1, status: 'VOTING_CLOSED', game: { id: 'existing' } });
    const res = mockRes();
    await handler(post({ gameDayId: 7 }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ existingGameId: 'existing' });
    expect(res.body.message).toContain('existing');
    expect(gameCreate).not.toHaveBeenCalled();
  });

  it('turns a racing duplicate (P2002) into the same 400, not a 500', async () => {
    gameDayFind.mockResolvedValue({ id: 7, squadId: 1, status: 'VOTING_CLOSED', game: null });
    gameCreate.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = mockRes();
    await handler(post({ gameDayId: 7 }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects another squad's game day, and one whose voting is still open", async () => {
    gameDayFind.mockResolvedValue({ id: 7, squadId: 2, status: 'VOTING_CLOSED', game: null });
    const other = mockRes();
    await handler(post({ gameDayId: 7 }), other);
    expect(other.statusCode).toBe(400);

    gameDayFind.mockResolvedValue({ id: 7, squadId: 1, status: 'VOTING_OPEN', game: null });
    const open = mockRes();
    await handler(post({ gameDayId: 7 }), open);
    expect(open.statusCode).toBe(400);
    expect(gameCreate).not.toHaveBeenCalled();
  });

  it('leaves a create without a gameDayId exactly as before', async () => {
    const res = mockRes();
    await handler(post({}), res);
    expect(res.statusCode).toBe(201);
    expect(gameDayFind).not.toHaveBeenCalled();
    expect(gameCreate.mock.calls[0][0].data.gameDayId).toBeNull();
  });
});
