import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above the imports, so the static import below picks up the mock (same
// pattern as lib/replacements.test.ts). $transaction is given the real interactive shape - it
// hands the callback a client - so the check-then-insert sequences inside each function run
// exactly as they do against a real Prisma client.
vi.mock('@/lib/prisma', () => {
  const client = {
    squad: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    player: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    squadJoinRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  };
  return { default: client };
});

import prisma from '@/lib/prisma';
import { PlayerType } from '@prisma/client';
import {
  createJoinRequest,
  approveJoinRequest,
  rejectJoinRequest,
  withdrawJoinRequest,
  MAX_NAME_LENGTH,
} from './joinRequests';

type Mock = ReturnType<typeof vi.fn>;
const mocked = prisma as unknown as {
  squad: { findUnique: Mock; findUniqueOrThrow: Mock };
  player: { findUnique: Mock; findMany: Mock; count: Mock; create: Mock };
  squadJoinRequest: {
    findFirst: Mock;
    findUnique: Mock;
    findMany: Mock;
    create: Mock;
    update: Mock;
    count: Mock;
  };
};

const SQUAD_ID = 1;
const ADMIN_EMAIL = 'admin@example.com';
const REQUESTER_EMAIL = 'newcomer@example.com';

const openSquad = { id: SQUAD_ID, enabled: true, openForOpenSlot: true, maxPlayers: null };

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    squadId: SQUAD_ID,
    email: REQUESTER_EMAIL,
    name: 'Newcomer',
    message: null,
    status: 'PENDING',
    createdPlayerId: null,
    ...overrides,
  };
}

// The happy path for addPlayer running inside the approval transaction.
function stubPlayerCreate(overrides: Record<string, unknown> = {}) {
  mocked.player.findMany.mockResolvedValue([]);
  mocked.player.create.mockResolvedValue({
    id: 99,
    squadId: SQUAD_ID,
    name: 'Newcomer',
    email: REQUESTER_EMAIL,
    playerType: PlayerType.OPEN_SLOT,
    rankScore: null,
    playerRank: null,
    highestRank: null,
    rankSince: null,
    colorHex: 'aabbcc',
    playerStatus: null,
    ...overrides,
  });
}

beforeEach(() => {
  for (const group of [mocked.squad, mocked.player, mocked.squadJoinRequest]) {
    for (const fn of Object.values(group)) (fn as Mock).mockReset();
  }
  mocked.squad.findUnique.mockResolvedValue(openSquad);
  mocked.squad.findUniqueOrThrow.mockResolvedValue(openSquad);
  mocked.player.findUnique.mockResolvedValue(null);
  mocked.squadJoinRequest.findFirst.mockResolvedValue(null);
  mocked.squadJoinRequest.update.mockImplementation(({ data }: { data: unknown }) => ({
    ...pendingRow(),
    ...(data as object),
  }));
});

describe('createJoinRequest', () => {
  it('creates a PENDING row for an open squad', async () => {
    mocked.squadJoinRequest.create.mockResolvedValue(pendingRow());

    await createJoinRequest(SQUAD_ID, REQUESTER_EMAIL, { name: 'Newcomer', message: ' hi ' });

    expect(mocked.squadJoinRequest.create).toHaveBeenCalledWith({
      data: {
        squadId: SQUAD_ID,
        email: REQUESTER_EMAIL,
        name: 'Newcomer',
        message: 'hi',
        status: 'PENDING',
      },
    });
  });

  it('lowercases the actor email rather than trusting its casing', async () => {
    mocked.squadJoinRequest.create.mockResolvedValue(pendingRow());

    await createJoinRequest(SQUAD_ID, '  NewComer@Example.COM ', { name: 'Newcomer' });

    expect(mocked.squadJoinRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: REQUESTER_EMAIL }) })
    );
  });

  it('rejects a squad that is not open for open-slot registration', async () => {
    mocked.squad.findUnique.mockResolvedValue({ ...openSquad, openForOpenSlot: false });

    await expect(
      createJoinRequest(SQUAD_ID, REQUESTER_EMAIL, { name: 'Newcomer' })
    ).rejects.toThrow('not accepting join requests');
  });

  it('rejects a disabled squad', async () => {
    mocked.squad.findUnique.mockResolvedValue({ ...openSquad, enabled: false });

    await expect(
      createJoinRequest(SQUAD_ID, REQUESTER_EMAIL, { name: 'Newcomer' })
    ).rejects.toThrow('not accepting join requests');
  });

  it('rejects someone already on the roster', async () => {
    mocked.player.findUnique.mockResolvedValue({ id: 3, email: REQUESTER_EMAIL });

    await expect(
      createJoinRequest(SQUAD_ID, REQUESTER_EMAIL, { name: 'Newcomer' })
    ).rejects.toThrow("already on this squad's roster");
  });

  it('rejects a second pending request for the same squad', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());

    await expect(
      createJoinRequest(SQUAD_ID, REQUESTER_EMAIL, { name: 'Newcomer' })
    ).rejects.toThrow('already have a pending request');
  });

  it('rejects a name longer than Player.name allows, rather than letting the insert fail', async () => {
    await expect(
      createJoinRequest(SQUAD_ID, REQUESTER_EMAIL, { name: 'x'.repeat(MAX_NAME_LENGTH + 1) })
    ).rejects.toThrow(`${MAX_NAME_LENGTH} characters or fewer`);
    expect(mocked.squadJoinRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a blank name', async () => {
    await expect(
      createJoinRequest(SQUAD_ID, REQUESTER_EMAIL, { name: '   ' })
    ).rejects.toThrow('A name is required');
  });

  // The cap is fulltime-only and a request is approved as open-slot by default, so a full squad
  // must still accept requests - blocking here would defeat the feature.
  it('does not consult maxPlayers', async () => {
    mocked.squad.findUnique.mockResolvedValue({ ...openSquad, maxPlayers: 1 });
    mocked.squadJoinRequest.create.mockResolvedValue(pendingRow());

    await createJoinRequest(SQUAD_ID, REQUESTER_EMAIL, { name: 'Newcomer' });

    expect(mocked.player.count).not.toHaveBeenCalled();
    expect(mocked.squadJoinRequest.create).toHaveBeenCalled();
  });
});

describe('approveJoinRequest', () => {
  it('creates an OPEN_SLOT player with no score by default and stamps the row', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());
    stubPlayerCreate();

    const result = await approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL);

    expect(result.alreadyExisted).toBe(false);
    expect(mocked.player.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          playerType: PlayerType.OPEN_SLOT,
          rankScore: null,
          email: REQUESTER_EMAIL,
        }),
      })
    );
    expect(mocked.squadJoinRequest.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({
        status: 'APPROVED',
        decidedByEmail: ADMIN_EMAIL,
        createdPlayerId: 99,
      }),
    });
  });

  it('refuses FULLTIME without a starting score', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());

    await expect(
      approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL, { playerType: PlayerType.FULLTIME })
    ).rejects.toThrow('starting score is required');
  });

  it('refuses a non-positive starting score', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());

    await expect(
      approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL, {
        playerType: PlayerType.OPEN_SLOT,
        initialScore: 0,
      })
    ).rejects.toThrow('greater than 0');
  });

  it('refuses a row that has already been decided', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow({ status: 'REJECTED' }));

    await expect(approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL)).rejects.toThrow(
      'already been decided'
    );
    expect(mocked.player.create).not.toHaveBeenCalled();
  });

  it('refuses a row belonging to another squad', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(null);

    await expect(approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL)).rejects.toThrow('Request not found');
  });

  it('re-validates an admin-edited name, which addPlayer would not', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());

    await expect(
      approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL, { name: 'y'.repeat(MAX_NAME_LENGTH + 1) })
    ).rejects.toThrow(`${MAX_NAME_LENGTH} characters or fewer`);
    expect(mocked.player.create).not.toHaveBeenCalled();
  });

  // An admin can add the same email through the roster while the request sits pending. Failing
  // here would leave the row PENDING forever with buttons that can never succeed.
  it('reconciles against an existing player instead of creating a duplicate', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());
    mocked.player.findUnique.mockResolvedValue({
      id: 42,
      squadId: SQUAD_ID,
      name: 'Newcomer',
      email: REQUESTER_EMAIL,
      playerType: PlayerType.OPEN_SLOT,
      rankScore: null,
      playerRank: null,
      highestRank: null,
      rankSince: null,
      colorHex: 'aabbcc',
      playerStatus: null,
    });

    const result = await approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL);

    expect(result.alreadyExisted).toBe(true);
    expect(mocked.player.create).not.toHaveBeenCalled();
    expect(mocked.squadJoinRequest.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ status: 'APPROVED', createdPlayerId: 42 }),
    });
  });

  describe('the fulltime-only cap', () => {
    it('blocks a FULLTIME approval when the fulltime roster is full', async () => {
      mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());
      mocked.squad.findUniqueOrThrow.mockResolvedValue({ ...openSquad, maxPlayers: 2 });
      mocked.player.count.mockResolvedValue(2);

      await expect(
        approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL, {
          playerType: PlayerType.FULLTIME,
          initialScore: 1000,
        })
      ).rejects.toThrow('full-time roster is full');
    });

    it('counts FULLTIME rows only, ignoring open-slot players', async () => {
      mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());
      mocked.squad.findUniqueOrThrow.mockResolvedValue({ ...openSquad, maxPlayers: 2 });
      mocked.player.count.mockResolvedValue(1);
      stubPlayerCreate({ playerType: PlayerType.FULLTIME, rankScore: 1000 });

      await approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL, {
        playerType: PlayerType.FULLTIME,
        initialScore: 1000,
      });

      expect(mocked.player.count).toHaveBeenCalledWith({
        where: { squadId: SQUAD_ID, playerType: PlayerType.FULLTIME },
      });
    });

    it('never consults the cap for an OPEN_SLOT approval, even on a full squad', async () => {
      mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());
      mocked.squad.findUniqueOrThrow.mockResolvedValue({ ...openSquad, maxPlayers: 1 });
      stubPlayerCreate();

      const result = await approveJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL);

      expect(result.alreadyExisted).toBe(false);
      expect(mocked.player.count).not.toHaveBeenCalled();
    });
  });
});

describe('rejectJoinRequest', () => {
  it('stamps REJECTED without touching the roster', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow());

    await rejectJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL);

    expect(mocked.player.create).not.toHaveBeenCalled();
    expect(mocked.squadJoinRequest.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ status: 'REJECTED', decidedByEmail: ADMIN_EMAIL }),
    });
  });

  it('refuses an already-decided row', async () => {
    mocked.squadJoinRequest.findFirst.mockResolvedValue(pendingRow({ status: 'APPROVED' }));

    await expect(rejectJoinRequest(SQUAD_ID, 10, ADMIN_EMAIL)).rejects.toThrow(
      'already been decided'
    );
  });
});

// Ownership is the security property here: sign-in is open to any verified Google account, so
// "signed in" says nothing about whose request this is.
describe('withdrawJoinRequest', () => {
  it('withdraws the caller’s own pending request', async () => {
    mocked.squadJoinRequest.findUnique.mockResolvedValue(pendingRow());

    await withdrawJoinRequest(10, REQUESTER_EMAIL);

    expect(mocked.squadJoinRequest.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ status: 'WITHDRAWN' }),
    });
  });

  it('refuses a request belonging to someone else, indistinguishably from a missing one', async () => {
    mocked.squadJoinRequest.findUnique.mockResolvedValue(pendingRow());

    await expect(withdrawJoinRequest(10, 'someone.else@example.com')).rejects.toThrow(
      'Request not found'
    );
    expect(mocked.squadJoinRequest.update).not.toHaveBeenCalled();
  });

  it('matches ownership case-insensitively on the session email', async () => {
    mocked.squadJoinRequest.findUnique.mockResolvedValue(pendingRow());

    await withdrawJoinRequest(10, 'NewComer@Example.com');

    expect(mocked.squadJoinRequest.update).toHaveBeenCalled();
  });

  it('refuses an already-decided row', async () => {
    mocked.squadJoinRequest.findUnique.mockResolvedValue(pendingRow({ status: 'WITHDRAWN' }));

    await expect(withdrawJoinRequest(10, REQUESTER_EMAIL)).rejects.toThrow('already been decided');
  });
});
