import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// OPEN_SLOT_PLAYERS_PLAN.md "Null-rankScore safety" item 2: the *authoritative* gate against a
// scoreless player reaching the Elo math is this route, not the game-planner's bulk-assign panel
// - an edited game, a direct API call, or any path that skips the planner button lands here. So
// the gate gets a test at the route level rather than only on the helper it calls.
vi.mock('@/lib/prisma', () => ({
  default: {
    player: { findMany: vi.fn() },
    game: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/auth', () => ({
  requireSquadAdmin: vi.fn(async () => ({ user: { email: 'admin@example.com' } })),
}));
vi.mock('@/lib/api/squadParam', () => ({
  parseSquadId: vi.fn(() => 1),
}));

import prisma from '@/lib/prisma';
import createHandler from './index';
import updateHandler from './[id]';

const playerFindMany = prisma.player.findMany as unknown as ReturnType<typeof vi.fn>;
const gameCreate = prisma.game.create as unknown as ReturnType<typeof vi.fn>;
const gameUpdate = prisma.game.update as unknown as ReturnType<typeof vi.fn>;

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
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

const GROUPS = { 'Group 1': [1, 2, 3, 4] };

beforeEach(() => {
  vi.clearAllMocks();
  gameCreate.mockResolvedValue({ id: 10 });
  gameUpdate.mockResolvedValue({ id: 10 });
  // The PUT route verifies the game belongs to this squad before the gate runs.
  (prisma.game.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '10', squadId: 1 });
});

describe('POST /api/squads/[squadId]/games - scoreless player gate', () => {
  it('rejects with 400 and names every scoreless player in the groups', async () => {
    playerFindMany.mockResolvedValue([
      { id: 1, name: 'ada', rankScore: 1000 },
      { id: 2, name: 'grace', rankScore: null },
      { id: 3, name: 'alan', rankScore: null },
      { id: 4, name: 'edsger', rankScore: 1100 },
    ]);

    const res = mockRes();
    await createHandler({ method: 'POST', body: { groups: GROUPS }, query: {} } as NextApiRequest, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('grace');
    expect(res.body.message).toContain('alan');
    expect(res.body.scorelessPlayers).toEqual([
      { id: 2, name: 'grace' },
      { id: 3, name: 'alan' },
    ]);
    expect(gameCreate).not.toHaveBeenCalled();
  });

  it('creates the game when every selected player has a score', async () => {
    playerFindMany.mockResolvedValue([
      { id: 1, name: 'ada', rankScore: 1000 },
      { id: 2, name: 'grace', rankScore: 900 },
      { id: 3, name: 'alan', rankScore: 950 },
      { id: 4, name: 'edsger', rankScore: 1100 },
    ]);

    const res = mockRes();
    await createHandler({ method: 'POST', body: { groups: GROUPS }, query: {} } as NextApiRequest, res);

    expect(res.statusCode).toBe(201);
    expect(gameCreate).toHaveBeenCalled();
  });

  it('only looks at players in this squad', async () => {
    playerFindMany.mockResolvedValue([]);
    const res = mockRes();
    await createHandler({ method: 'POST', body: { groups: GROUPS }, query: {} } as NextApiRequest, res);

    expect(playerFindMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 3, 4] }, squadId: 1 },
      select: { id: true, name: true, rankScore: true },
    });
  });
});

describe('PUT /api/squads/[squadId]/games/[id] - scoreless player gate', () => {
  it('rejects an edit that adds a scoreless player', async () => {
    playerFindMany.mockResolvedValue([
      { id: 1, name: 'ada', rankScore: 1000 },
      { id: 2, name: 'grace', rankScore: null },
      { id: 3, name: 'alan', rankScore: 950 },
      { id: 4, name: 'edsger', rankScore: 1100 },
    ]);

    const res = mockRes();
    await updateHandler(
      { method: 'PUT', body: { groups: GROUPS }, query: { id: '10' } } as unknown as NextApiRequest,
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('grace');
    expect(gameUpdate).not.toHaveBeenCalled();
  });

  it('leaves a scores-only update (no groups in the body) alone', async () => {
    const res = mockRes();
    await updateHandler(
      { method: 'PUT', body: { scores: {} }, query: { id: '10' } } as unknown as NextApiRequest,
      res
    );

    expect(playerFindMany).not.toHaveBeenCalled();
    expect(gameUpdate).toHaveBeenCalled();
  });
});
