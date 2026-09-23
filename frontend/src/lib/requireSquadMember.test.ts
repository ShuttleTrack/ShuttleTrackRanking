import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));
vi.mock('@/pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));
vi.mock('@/lib/auth/squadAccess', () => ({ getSquadAccess: vi.fn() }));

import { getServerSession } from 'next-auth/next';
import { getSquadAccess } from '@/lib/auth/squadAccess';
import { requireSquadMember } from './auth';

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const access = getSquadAccess as unknown as ReturnType<typeof vi.fn>;

function mockRes() {
  const res = {
    statusCode: 0,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };
  return res as unknown as NextApiResponse & { statusCode: number };
}

const req = {} as NextApiRequest;

beforeEach(() => vi.clearAllMocks());

describe('requireSquadMember', () => {
  it('401s a signed-out request', async () => {
    session.mockResolvedValue(null);
    const res = mockRes();
    expect(await requireSquadMember(req, res, 1)).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it("401s a signed-in player of squad A hitting squad B's routes", async () => {
    session.mockResolvedValue({ user: { email: 'a@x.test', isSuperAdmin: false } });
    access.mockResolvedValue({ player: null, isSquadAdmin: false });
    const res = mockRes();
    expect(await requireSquadMember(req, res, 2)).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(access).toHaveBeenCalledWith('a@x.test', 2);
  });

  it('admits a player, returning their Player row', async () => {
    session.mockResolvedValue({ user: { email: 'p@x.test' } });
    access.mockResolvedValue({ player: { id: 7 }, isSquadAdmin: false });
    expect(await requireSquadMember(req, mockRes(), 1)).toMatchObject({ player: { id: 7 }, isAdmin: false, email: 'p@x.test' });
  });

  it('admits an admin with no Player row - it does not guarantee a player', async () => {
    session.mockResolvedValue({ user: { email: 'root@x.test', isSuperAdmin: true } });
    access.mockResolvedValue({ player: null, isSquadAdmin: false });
    expect(await requireSquadMember(req, mockRes(), 1)).toMatchObject({ player: null, isAdmin: true });
  });
});
