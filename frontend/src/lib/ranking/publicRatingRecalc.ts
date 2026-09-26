import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { replayPublicRatings, type PublicEncounterInput } from './publicRating';

// Rebuilds the derived PublicRating/PublicRatingEvent tables from every processed encounter of
// every enabled + public squad. Always a full rebuild, never incremental: the seed and the
// inactivity ladder depend on the whole history, and a weight change re-scores all of it.

const EVENT_INSERT_CHUNK = 1000;

export interface RecalculationSummary {
  people: number;
  matches: number;
  events: number;
  durationMs: number;
  recalculatedAt: string;
}

export interface PublicRatingStatus {
  lastRecalculatedAt: string | null;
  people: number;
  events: number;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function runRecalculation(): Promise<RecalculationSummary> {
  const startedAt = Date.now();

  const squads = await prisma.squad.findMany({
    where: { enabled: true, isPublic: true },
    select: { id: true, publicWeight: true },
  });
  const squadIds = squads.map((s) => s.id);
  const weightBySquad = new Map(squads.map((s) => [s.id, s.publicWeight]));

  const [encounters, players] = await Promise.all([
    prisma.encounter.findMany({
      where: { squadId: { in: squadIds }, processed: true },
      select: {
        id: true,
        squadId: true,
        encounterDate: true,
        team1: true,
        team2: true,
        team1SetPoints: true,
        team2SetPoints: true,
        processed: true,
      },
    }),
    prisma.player.findMany({ where: { squadId: { in: squadIds } }, select: { id: true, email: true } }),
  ]);

  const personKeyByPlayerId = new Map<number, string>();
  for (const player of players) {
    const email = player.email.trim().toLowerCase();
    if (email) personKeyByPlayerId.set(player.id, email);
  }

  const inputs: PublicEncounterInput[] = encounters.map((e) => ({
    ...e,
    encounterDate: toDateOnly(e.encounterDate),
    weight: weightBySquad.get(e.squadId)!,
  }));

  const recalculatedAt = new Date();
  const { ratings, events } = replayPublicRatings(inputs, personKeyByPlayerId, toDateOnly(recalculatedAt));

  const ratingRows: Prisma.PublicRatingCreateManyInput[] = Array.from(ratings.entries()).map(([email, r]) => ({
    email,
    rating: r.rating,
    seed: r.seed,
    matches: r.matches,
    lastPlayed: r.lastPlayed ? parseDateOnly(r.lastPlayed) : null,
    missedWeeks: r.missedWeeks,
    recalculatedAt,
  }));
  const eventRows: Prisma.PublicRatingEventCreateManyInput[] = events.map((e) => ({
    ...e,
    eventDate: parseDateOnly(e.eventDate),
  }));

  await prisma.$transaction(
    async (tx) => {
      await tx.publicRatingEvent.deleteMany({});
      await tx.publicRating.deleteMany({});
      if (ratingRows.length > 0) await tx.publicRating.createMany({ data: ratingRows });
      for (let i = 0; i < eventRows.length; i += EVENT_INSERT_CHUNK) {
        await tx.publicRatingEvent.createMany({ data: eventRows.slice(i, i + EVENT_INSERT_CHUNK) });
      }
    },
    { maxWait: 10_000, timeout: 60_000 }
  );

  const matchIds = new Set(events.filter((e) => e.kind === 'MATCH').map((e) => e.encounterId));
  return {
    people: ratingRows.length,
    matches: matchIds.size,
    events: eventRows.length,
    durationMs: Date.now() - startedAt,
    recalculatedAt: recalculatedAt.toISOString(),
  };
}

// One recalculation at a time (the app runs as a single long-lived container, so an in-process
// lock is enough). A call arriving mid-run is queued behind it; further calls share that one
// queued run, since it will already see everything they would.
let running: Promise<RecalculationSummary> | null = null;
let queued: Promise<RecalculationSummary> | null = null;

export function recalculatePublicRatings(): Promise<RecalculationSummary> {
  if (!running) {
    running = runRecalculation().finally(() => {
      running = null;
    });
    return running;
  }
  if (!queued) {
    queued = running
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return recalculatePublicRatings();
      });
  }
  return queued;
}

// For the automatic triggers (process, weight/visibility changes): the squad-level action that
// triggered it has already succeeded and must not fail because of this - the superadmin
// Recalculate button can always repair the public tables afterwards.
export async function recalculatePublicRatingsSafely(reason: string): Promise<void> {
  try {
    await recalculatePublicRatings();
  } catch (error) {
    console.error(`Public rating recalculation failed (${reason}):`, error);
  }
}

export async function getPublicRatingStatus(): Promise<PublicRatingStatus> {
  const [people, events, latest] = await Promise.all([
    prisma.publicRating.count(),
    prisma.publicRatingEvent.count(),
    prisma.publicRating.aggregate({ _max: { recalculatedAt: true } }),
  ]);
  return {
    lastRecalculatedAt: latest._max.recalculatedAt?.toISOString() ?? null,
    people,
    events,
  };
}
