// Self-service slot replacement nominations (OPEN_SLOT_PLAYERS_PLAN.md). A fulltime player gives
// an open-slot player their slot for a date range - no admin approval needed, just the guardrails
// below. Kept squad-agnostic-logic-wise (the SlotReplacement row itself carries no ranking math),
// separate from lib/ranking/ since this is a scheduling/roster-membership concern, not scoring.
import { PlayerType, type SlotReplacement } from '@prisma/client';
import prisma from '@/lib/prisma';
import { countPlayingDaysBetween } from '@/lib/scheduling/playingDayCalculator';
import type { SquadScheduleData } from '@/lib/squadSchedule';

export const MIN_REPLACEMENT_PLAYING_DAYS = 3;

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function parseDateOnly(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

export interface CreateSlotReplacementInput {
  fulltimePlayerId: number;
  replacementPlayerId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  createdByEmail: string;
}

// Throws with a user-facing message on any validation failure - callers (the API route) surface
// error.message directly as a 400, matching this codebase's existing convention for validation
// errors raised from lib/ functions (see players.ts's addPlayer/updatePlayer).
export async function createSlotReplacement(
  squadId: number,
  input: CreateSlotReplacementInput
): Promise<SlotReplacement> {
  const { fulltimePlayerId, replacementPlayerId, createdByEmail } = input;
  if (fulltimePlayerId === replacementPlayerId) {
    throw new Error('A player cannot replace themselves');
  }

  const startDate = parseDateOnly(input.startDate);
  const endDate = parseDateOnly(input.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid start or end date');
  }
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('End date must be on or after the start date');
  }

  const [fulltimePlayer, replacementPlayer, squad] = await Promise.all([
    prisma.player.findUnique({ where: { id: fulltimePlayerId } }),
    prisma.player.findUnique({ where: { id: replacementPlayerId } }),
    prisma.squad.findUniqueOrThrow({ where: { id: squadId } }),
  ]);

  if (!fulltimePlayer || fulltimePlayer.squadId !== squadId) {
    throw new Error('Fulltime player not found in this squad');
  }
  if (fulltimePlayer.email.toLowerCase() !== createdByEmail.toLowerCase()) {
    throw new Error('You can only nominate a replacement for your own slot');
  }
  if (fulltimePlayer.playerType !== PlayerType.FULLTIME) {
    throw new Error('Only a fulltime player has a slot to give away');
  }
  if (!replacementPlayer || replacementPlayer.squadId !== squadId) {
    throw new Error('Replacement player not found in this squad');
  }
  if (replacementPlayer.playerType !== PlayerType.OPEN_SLOT) {
    throw new Error('The nominated replacement must be an open-slot player');
  }

  const schedule = squad.schedule as SquadScheduleData | null;
  if (!schedule || !schedule.isRecurring) {
    throw new Error(
      "This squad's playing schedule isn't configured yet - set it up in squad settings before creating a replacement"
    );
  }

  // countPlayingDaysBetween is (fromExclusive, toInclusive] - pass the day before startDate so
  // the range's own start date is included if it's a playing day.
  const playingDays = countPlayingDaysBetween(schedule, addUtcDays(startDate, -1), endDate);
  if (playingDays < MIN_REPLACEMENT_PLAYING_DAYS) {
    throw new Error(
      `The selected dates cover only ${playingDays} playing day(s) - a replacement needs at least ${MIN_REPLACEMENT_PLAYING_DAYS}`
    );
  }

  // Overlap check + insert in one transaction (MySQL can't express "no overlapping ranges" as a
  // constraint) so two concurrent nominations for the same slot/player can't both pass.
  return prisma.$transaction(async (tx) => {
    const overlapping = await tx.slotReplacement.findFirst({
      where: {
        squadId,
        cancelledAt: null,
        OR: [{ fulltimePlayerId }, { replacementPlayerId }],
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlapping) {
      throw new Error('One of these players already has an overlapping replacement window');
    }

    return tx.slotReplacement.create({
      data: {
        squadId,
        fulltimePlayerId,
        replacementPlayerId,
        startDate,
        endDate,
        createdByEmail: createdByEmail.toLowerCase(),
      },
    });
  });
}

// Only the nominating fulltime player can cancel/shorten their own nomination early - matches
// "self-service, no admin approval" for creation; admins get a read-only view (see the admin
// players page), not a cancel button, in this first cut.
export async function cancelSlotReplacement(
  squadId: number,
  id: number,
  requestedByEmail: string
): Promise<SlotReplacement> {
  const replacement = await prisma.slotReplacement.findUnique({
    where: { id },
    include: { fulltimePlayer: true },
  });
  if (!replacement || replacement.squadId !== squadId) {
    throw new Error('Replacement not found');
  }
  if (replacement.fulltimePlayer.email.toLowerCase() !== requestedByEmail.toLowerCase()) {
    throw new Error('Only the nominating player can cancel this replacement');
  }
  if (replacement.cancelledAt) {
    return replacement;
  }
  return prisma.slotReplacement.update({ where: { id }, data: { cancelledAt: new Date() } });
}

export interface SlotReplacementWithNames extends SlotReplacement {
  fulltimePlayer: { id: number; name: string };
  replacementPlayer: { id: number; name: string };
}

export async function listSlotReplacementsForSquad(squadId: number): Promise<SlotReplacementWithNames[]> {
  return prisma.slotReplacement.findMany({
    where: { squadId },
    orderBy: { startDate: 'desc' },
    include: {
      fulltimePlayer: { select: { id: true, name: true } },
      replacementPlayer: { select: { id: true, name: true } },
    },
  });
}

export async function listSlotReplacementsForFulltimePlayer(
  squadId: number,
  fulltimePlayerId: number
): Promise<SlotReplacementWithNames[]> {
  return prisma.slotReplacement.findMany({
    where: { squadId, fulltimePlayerId },
    orderBy: { startDate: 'desc' },
    include: {
      fulltimePlayer: { select: { id: true, name: true } },
      replacementPlayer: { select: { id: true, name: true } },
    },
  });
}

export interface OpenSlotPlayerOption {
  id: number;
  name: string;
  email: string;
}

// Name-or-email search for the nomination UI's player picker.
export async function searchOpenSlotPlayers(squadId: number, query: string): Promise<OpenSlotPlayerOption[]> {
  const trimmed = query.trim();
  const players = await prisma.player.findMany({
    where: {
      squadId,
      playerType: PlayerType.OPEN_SLOT,
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed } },
              { email: { contains: trimmed } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: 20,
  });
  return players.map((p) => ({ id: p.id, name: p.name, email: p.email }));
}
