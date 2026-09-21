// Self-service squad join requests (SELF_REGISTRATION_PLAN.md). A signed-in person asks to join
// a squad that has opted in (Squad.openForOpenSlot); a squad admin approves - creating the
// Player row, open-slot by default - or rejects.
//
// Sits outside lib/ranking/ for the same reason lib/replacements.ts does: this is roster
// membership, not scoring. Throws ValidationError for caller error so routes can answer 400
// rather than a blanket 500.
//
// **The one rule not to get wrong**: every function here takes the actor's email as its own
// `actorEmail` argument, which the route fills from getServerSession - never from a request
// body. Since self-registration opened sign-in to any verified Google account
// (lib/auth/validateUserAccess.ts), a body-supplied email would let anyone file or withdraw a
// request as someone else.
import { JoinRequestStatus, PlayerType, Prisma, type SquadJoinRequest } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ValidationError } from '@/lib/api/validationError';
import { addPlayer, type SecurePlayerInfo } from '@/lib/ranking/players';
import { derivePlayerStatus } from '@/lib/ranking/playerStatus';

// Player.name is VarChar(32) and a join request's name becomes that one on approval, so the
// limit is enforced here rather than left to blow up as a database error at insert time - a
// Google display name can easily be longer than this.
export const MAX_NAME_LENGTH = 32;
export const MAX_MESSAGE_LENGTH = 500;

export interface JoinRequestInput {
  name: string;
  message?: string | null;
}

export interface ApprovalInput {
  playerType?: PlayerType;
  initialScore?: number | null;
  // The admin may correct the requester's name before it becomes a Player row.
  name?: string | null;
}

export interface ApprovalResult {
  player: SecurePlayerInfo;
  // True when a Player already existed for this email and the request was reconciled against it
  // rather than creating anything - see approveJoinRequest.
  alreadyExisted: boolean;
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Shared by create and approve: the approve path has to re-check because the admin can edit the
// name in the approve modal, and addPlayer itself performs no length validation.
export function validateName(raw: string | null | undefined): string {
  const name = (raw ?? '').trim();
  if (name.length === 0) {
    throw new ValidationError('A name is required');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  return name;
}

function validateMessage(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const message = raw.trim();
  if (message.length === 0) return null;
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
  }
  return message;
}

// Check-then-insert inside one transaction. The real rule is "at most one PENDING row per
// (squadId, email)", which MySQL can't express as a partial unique index - same situation as
// SlotReplacement's overlap rule, and handled the same way rather than inventing a second
// pattern.
//
// Deliberately does NOT check maxPlayers: that caps the FULLTIME roster only, and a request is
// approved as OPEN_SLOT by default, so a squad at its fulltime cap is still open for open-slot
// registration. Blocking here would defeat the point of the feature.
export async function createJoinRequest(
  squadId: number,
  actorEmail: string,
  input: JoinRequestInput
): Promise<SquadJoinRequest> {
  const email = normaliseEmail(actorEmail);
  const name = validateName(input.name);
  const message = validateMessage(input.message);

  return prisma.$transaction(async (tx) => {
    const squad = await tx.squad.findUnique({ where: { id: squadId } });
    if (!squad || !squad.enabled || !squad.openForOpenSlot) {
      throw new ValidationError('This squad is not accepting join requests');
    }

    const existingPlayer = await tx.player.findUnique({
      where: { squadId_email: { squadId, email } },
    });
    if (existingPlayer) {
      throw new ValidationError("You're already on this squad's roster");
    }

    const existingRequest = await tx.squadJoinRequest.findFirst({
      where: { squadId, email, status: JoinRequestStatus.PENDING },
    });
    if (existingRequest) {
      throw new ValidationError('You already have a pending request for this squad');
    }

    return tx.squadJoinRequest.create({
      data: { squadId, email, name, message, status: JoinRequestStatus.PENDING },
    });
  });
}

// Admin oversight list for one squad. Returns every status, not just pending: with re-requesting
// after a rejection allowed, an admin needs to see that they already turned this person down.
export async function listJoinRequestsForSquad(
  squadId: number,
  status?: JoinRequestStatus
): Promise<SquadJoinRequest[]> {
  return prisma.squadJoinRequest.findMany({
    where: { squadId, ...(status ? { status } : {}) },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function countPendingJoinRequests(squadId: number): Promise<number> {
  return prisma.squadJoinRequest.count({
    where: { squadId, status: JoinRequestStatus.PENDING },
  });
}

export interface MyJoinRequest {
  id: number;
  squadId: number;
  squadName: string;
  squadSlug: string;
  // Whether that squad is still listed in the directory. A squad can be closed or disabled while
  // a request is pending, and without this the requester would have no surface left to see or
  // withdraw it from - see the browse page.
  squadStillOpen: boolean;
  name: string;
  message: string | null;
  status: JoinRequestStatus;
  createdAt: string;
  decidedAt: string | null;
}

// The caller's own rows, across ALL squads and ALL statuses - deliberately independent of the
// directory's enabled && openForOpenSlot filter.
export async function listJoinRequestsForEmail(actorEmail: string): Promise<MyJoinRequest[]> {
  const email = normaliseEmail(actorEmail);
  const rows = await prisma.squadJoinRequest.findMany({
    where: { email },
    include: { squad: true },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row) => ({
    id: row.id,
    squadId: row.squadId,
    squadName: row.squad.name,
    squadSlug: row.squad.slug,
    squadStillOpen: row.squad.enabled && row.squad.openForOpenSlot,
    name: row.name,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }));
}

export async function withdrawJoinRequest(id: number, actorEmail: string): Promise<SquadJoinRequest> {
  const email = normaliseEmail(actorEmail);

  return prisma.$transaction(async (tx) => {
    const row = await tx.squadJoinRequest.findUnique({ where: { id } });
    // Ownership is decided against the session email, never a body field. A row belonging to
    // someone else reads as "not found" rather than "forbidden" - no reason to confirm to a
    // stranger that a given request id exists.
    if (!row || row.email !== email) {
      throw new ValidationError('Request not found');
    }
    if (row.status !== JoinRequestStatus.PENDING) {
      throw new ValidationError('That request has already been decided');
    }

    return tx.squadJoinRequest.update({
      where: { id },
      data: { status: JoinRequestStatus.WITHDRAWN, decidedAt: new Date() },
    });
  });
}

// Loads a PENDING row scoped to this squad, or throws. Ids are a globally-unique sequence across
// squads, so scoping by squadId is what stops a squad-scoped route being used to decide another
// squad's request by guessing an id.
async function loadPendingForSquad(
  tx: Prisma.TransactionClient,
  squadId: number,
  id: number
): Promise<SquadJoinRequest> {
  const row = await tx.squadJoinRequest.findFirst({ where: { id, squadId } });
  if (!row) {
    throw new ValidationError('Request not found');
  }
  if (row.status !== JoinRequestStatus.PENDING) {
    throw new ValidationError('That request has already been decided');
  }
  return row;
}

// Creates the Player row and stamps the request in one transaction - a created player against a
// still-PENDING request would invite a duplicate second approval.
//
// Idempotent against an existing player: an admin can add someone manually through the roster
// while their request sits pending, and failing here would leave the row PENDING forever with
// buttons that can never succeed. The admin's intent ("this person should be a member") is
// already satisfied, so the request is reconciled against the existing player instead.
export async function approveJoinRequest(
  squadId: number,
  id: number,
  actorEmail: string,
  input: ApprovalInput = {}
): Promise<ApprovalResult> {
  const decidedByEmail = normaliseEmail(actorEmail);
  const playerType = input.playerType ?? PlayerType.OPEN_SLOT;
  const hasScore = input.initialScore !== undefined && input.initialScore !== null;

  if (playerType === PlayerType.FULLTIME && (!hasScore || Number(input.initialScore) <= 0)) {
    throw new ValidationError('A starting score is required for a full-time player');
  }
  if (hasScore && Number(input.initialScore) <= 0) {
    throw new ValidationError('Starting score must be greater than 0');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const row = await loadPendingForSquad(tx, squadId, id);
      // Re-validated because the admin may have edited it in the approve modal, and addPlayer
      // performs no length check of its own.
      const name = validateName(input.name ?? row.name);

      const existing = await tx.player.findUnique({
        where: { squadId_email: { squadId, email: row.email } },
      });

      if (existing) {
        await tx.squadJoinRequest.update({
          where: { id },
          data: {
            status: JoinRequestStatus.APPROVED,
            decidedAt: new Date(),
            decidedByEmail,
            createdPlayerId: existing.id,
          },
        });
        // Built field-by-field rather than via toSecurePlayerInfo, which calls
        // timeInHighestRankLabel and *throws* on a null rankSince (a deliberately preserved
        // Java quirk - see lib/ranking/period.ts). A scoreless open-slot player is precisely
        // the most likely row to land here, and every one of those has rankSince null.
        // addPlayer returns timeInHighestRank: null for the same reason.
        return {
          player: {
            id: existing.id,
            name: existing.name,
            rankScore: existing.rankScore,
            playerRank: existing.playerRank,
            previousRank: existing.playerRank,
            colorHex: existing.colorHex,
            highestRank: existing.highestRank,
            timeInHighestRank: null,
            status: derivePlayerStatus(existing),
            email: existing.email,
            playerType: existing.playerType,
            hasScore: existing.rankScore !== null,
          },
          alreadyExisted: true,
        };
      }

      const player = await addPlayer(
        squadId,
        {
          name,
          email: row.email,
          playerType,
          initialScore: hasScore ? Number(input.initialScore) : undefined,
        },
        tx
      );

      await tx.squadJoinRequest.update({
        where: { id },
        data: {
          status: JoinRequestStatus.APPROVED,
          decidedAt: new Date(),
          decidedByEmail,
          createdPlayerId: player.id,
        },
      });

      return { player, alreadyExisted: false };
    });
  } catch (error) {
    // The pre-check above makes this unlikely, not impossible: two admins approving concurrently
    // can interleave between the findUnique and the insert. Without this it surfaces as a 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ValidationError("That player is already on this squad's roster");
    }
    throw error;
  }
}

export async function rejectJoinRequest(
  squadId: number,
  id: number,
  actorEmail: string
): Promise<SquadJoinRequest> {
  const decidedByEmail = normaliseEmail(actorEmail);

  return prisma.$transaction(async (tx) => {
    await loadPendingForSquad(tx, squadId, id);
    return tx.squadJoinRequest.update({
      where: { id },
      data: { status: JoinRequestStatus.REJECTED, decidedAt: new Date(), decidedByEmail },
    });
  });
}
