import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// ATTENDANCE_VOTE_PLAN.md, "The identity rule": the acting player is resolved from the session
// (getSquadAccess via requireSquadMember), never from a request body. The one security property
// in the plan, so every write path gets a route-level test rather than a review note - and the
// admin release, where a body playerId is the point, gets one proving it is honoured.
vi.mock('@/lib/auth', () => ({
  requireSquadMember: vi.fn(),
  requireSquadAdmin: vi.fn(async () => ({ user: { email: 'admin@x.test' } })),
}));
vi.mock('@/lib/api/squadParam', () => ({ parseSquadId: vi.fn(() => 1) }));
vi.mock('@/lib/api/gameDayParam', () => ({ resolveGameDayParam: vi.fn(async () => ({ id: 42, squadId: 1, status: 'VOTING_CLOSED' })) }));
vi.mock('@/lib/gameDay/votes', () => ({ castVote: vi.fn(async () => ({ choice: 'IN' })) }));
vi.mock('@/lib/gameDay/openSlots', () => ({
  joinOpenSlot: vi.fn(async () => ({ status: 'WAITING', source: null })),
  leaveOpenSlot: vi.fn(async () => undefined),
}));
vi.mock('@/lib/gameDay/lifecycle', () => ({
  releaseSlot: vi.fn(async () => undefined),
  closeVoting: vi.fn(),
  cancelGameDay: vi.fn(),
}));
vi.mock('@/lib/gameDay/view', () => ({ getGameDayAttendance: vi.fn(async () => ({})) }));
vi.mock('@/lib/gameDay/eligibility', () => ({ loadGameDayState: vi.fn(async () => ({})) }));
vi.mock('@/lib/gameDay/nominations', () => ({
  nominate: vi.fn(async (_s: number, _g: number, _nominator: number, nominee: number) => ({ nomineePlayerId: nominee })),
  revokeNomination: vi.fn(async () => undefined),
  nominationVerdict: vi.fn(() => ({ ok: true })),
  nominationCandidates: vi.fn(() => [{ id: 7, name: 'Bob', email: 'bobby.tables@example.com' }]),
}));
vi.mock('@/lib/replacements', () => ({
  maskEmail: (email: string) => `${email.slice(0, 5)}***${email.slice(email.lastIndexOf('@'))}`,
}));
vi.mock('@/lib/prisma', () => ({ default: { gameDay: { findUniqueOrThrow: vi.fn(async () => ({ id: 42 })) } } }));

import { requireSquadMember } from '@/lib/auth';
import { castVote } from '@/lib/gameDay/votes';
import { joinOpenSlot, leaveOpenSlot } from '@/lib/gameDay/openSlots';
import { releaseSlot } from '@/lib/gameDay/lifecycle';
import { nominate, revokeNomination } from '@/lib/gameDay/nominations';
import { ValidationError } from '@/lib/api/validationError';
import voteHandler from './[date]/vote';
import openSlotHandler from './[date]/open-slot';
import adminHandler from './[date]/admin';
import nominationHandler from './[date]/nomination';

const member = requireSquadMember as unknown as ReturnType<typeof vi.fn>;
const SESSION_PLAYER = { id: 5, squadId: 1, email: 'me@x.test' };
const SOMEONE_ELSE = { playerId: 99, player: { id: 99 }, email: 'victim@x.test', playerEmail: 'victim@x.test' };

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
    end() {
      return this;
    },
  };
  return res as unknown as NextApiResponse & { statusCode: number; body: any };
}

const req = (method: string, body: unknown = undefined) =>
  ({ method, body, query: { squadId: '1', date: '2026-09-23' } }) as unknown as NextApiRequest;

beforeEach(() => {
  vi.clearAllMocks();
  member.mockResolvedValue({ session: {}, email: SESSION_PLAYER.email, player: SESSION_PLAYER, isAdmin: false });
});

describe('a body naming another player has no effect', () => {
  it('PUT vote acts as the session player', async () => {
    const res = mockRes();
    await voteHandler(req('PUT', { choice: 'IN', ...SOMEONE_ELSE }), res);
    expect(res.statusCode).toBe(200);
    expect(castVote).toHaveBeenCalledWith(1, 42, SESSION_PLAYER.id, 'IN');
  });

  it('POST open-slot acts as the session player', async () => {
    const res = mockRes();
    await openSlotHandler(req('POST', SOMEONE_ELSE), res);
    expect(joinOpenSlot).toHaveBeenCalledWith(1, 42, SESSION_PLAYER.id);
  });

  it('DELETE open-slot acts as the session player', async () => {
    const res = mockRes();
    await openSlotHandler(req('DELETE', SOMEONE_ELSE), res);
    expect(res.statusCode).toBe(204);
    expect(leaveOpenSlot).toHaveBeenCalledWith(1, 42, SESSION_PLAYER.id);
  });
});

describe('slot nominations (SINGLE_DAY_NOMINATION_PLAN.md)', () => {
  it('PUT nomination makes the SESSION player the nominator - a body naming another nominator is ignored', async () => {
    const res = mockRes();
    await nominationHandler(req('PUT', { nomineePlayerId: 7, nominatorPlayerId: 99, ...SOMEONE_ELSE }), res);
    expect(res.statusCode).toBe(200);
    expect(nominate).toHaveBeenCalledWith(1, 42, SESSION_PLAYER.id, 7);
  });

  it("DELETE nomination revokes the session player's own hand-off", async () => {
    const res = mockRes();
    await nominationHandler(req('DELETE', SOMEONE_ELSE), res);
    expect(res.statusCode).toBe(204);
    expect(revokeNomination).toHaveBeenCalledWith(1, 42, SESSION_PLAYER.id);
  });

  it('GET candidates returns masked addresses only - the route is open to any squad member', async () => {
    const res = mockRes();
    await nominationHandler({ ...req('GET'), query: { squadId: '1', date: '2026-09-23', query: 'bob' } } as unknown as NextApiRequest, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: 7, name: 'Bob', maskedEmail: 'bobby***@example.com' }]);
    expect(JSON.stringify(res.body)).not.toContain('bobby.tables');
  });

  it('a superadmin with no Player row cannot pass a slot on', async () => {
    member.mockResolvedValue({ session: {}, email: 'root@x.test', player: null, isAdmin: true });
    const res = mockRes();
    await nominationHandler(req('PUT', { nomineePlayerId: 7 }), res);
    expect(res.statusCode).toBe(403);
    expect(nominate).not.toHaveBeenCalled();
  });
});

describe('the one deliberate exception', () => {
  it('PATCH admin { action: release, playerId } acts on the named player', async () => {
    const res = mockRes();
    await adminHandler(req('PATCH', { action: 'release', playerId: 99 }), res);
    expect(res.statusCode).toBe(200);
    expect(releaseSlot).toHaveBeenCalledWith(1, 42, 99);
  });
});

describe('gates', () => {
  it('a superadmin with no Player row passes the member gate but cannot vote or claim', async () => {
    member.mockResolvedValue({ session: {}, email: 'root@x.test', player: null, isAdmin: true });
    const voteRes = mockRes();
    await voteHandler(req('PUT', { choice: 'IN' }), voteRes);
    expect(voteRes.statusCode).toBe(403);
    const slotRes = mockRes();
    await openSlotHandler(req('POST'), slotRes);
    expect(slotRes.statusCode).toBe(403);
    expect(castVote).not.toHaveBeenCalled();
    expect(joinOpenSlot).not.toHaveBeenCalled();
  });

  it('stops dead when the member gate refuses (it has already answered 401)', async () => {
    member.mockResolvedValue(null);
    await voteHandler(req('PUT', { choice: 'IN' }), mockRes());
    expect(castVote).not.toHaveBeenCalled();
  });

  it('rejects a malformed choice before touching anything', async () => {
    const res = mockRes();
    await voteHandler(req('PUT', { choice: 'MAYBE' }), res);
    expect(res.statusCode).toBe(400);
    expect(castVote).not.toHaveBeenCalled();
  });

  it('answers a rule violation with 400 and its reason, not 500', async () => {
    (castVote as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ValidationError('Voting has closed'));
    const res = mockRes();
    await voteHandler(req('PUT', { choice: 'IN' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Voting has closed' });
  });
});
