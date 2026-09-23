// Self-service slot replacement nominations (OPEN_SLOT_PLAYERS_PLAN.md). A fulltime player gives
// an open-slot player their slot for a date range - no admin approval needed, just the guardrails
// below. Kept squad-agnostic-logic-wise (the SlotReplacement row itself carries no ranking math),
// separate from lib/ranking/ since this is a scheduling/roster-membership concern, not scoring.
import { PlayerType, type SlotReplacement } from '@prisma/client';
import prisma from '@/lib/prisma';
import { countPlayingDaysBetween, getPlayingDatesInRange } from '@/lib/scheduling/playingDayCalculator';
import type { SquadScheduleData } from '@/lib/squadSchedule';
import { GAME_DAY_TX_OPTIONS } from '@/lib/gameDay/lock';
import { deliverVacancyPlans, type VacancyPlan } from '@/lib/gameDay/openSlots';
import { findBlockingNomination } from '@/lib/gameDay/nominations';
import { reconcileSlotTransfer } from '@/lib/gameDay/reconcile';

export const MIN_REPLACEMENT_PLAYING_DAYS = 3;
export const MAX_REPLACEMENT_MONTHS = 4;

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Clamps to the end of the target month rather than letting JS roll over (31 Oct + 4 months is
// 28/29 Feb here, not 3 March), so the cap is never quietly a few days longer than advertised.
function addUtcMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfTargetMonth)));
}

// The furthest endDate a window starting on `startDate` may have. Exported for the nomination UI
// so it can bound its own date picker with the same rule the server enforces.
export function maxEndDateFor(startDate: Date): Date {
  return addUtcMonthsClamped(startDate, MAX_REPLACEMENT_MONTHS);
}

function parseDateOnly(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Every rule about the date range itself, in one place: createSlotReplacement and the nomination
// UI's preview endpoint both go through this, so the "3 playing days, 4 months, not already over"
// the form shows can't drift from the one the write path enforces. Throws with a user-facing
// message, like the rest of this module.
export function parseReplacementWindow(startDateString: string, endDateString: string): {
  startDate: Date;
  endDate: Date;
} {
  const startDate = parseDateOnly(startDateString);
  const endDate = parseDateOnly(endDateString);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid start or end date');
  }
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('End date must be on or after the start date');
  }
  // A window that is already over can never be active, so it would silently do nothing. A window
  // that *starts* in the past is fine - covering from last Wednesday onwards is a real request.
  if (endDate.getTime() < todayDateOnly().getTime()) {
    throw new Error('That date range has already passed');
  }
  // Bounded before countPlayingDaysBetween ever sees the range: that calculator walks the range
  // one day at a time, so an unbounded endDate (a date input accepts year 9999, and nothing else
  // here caps it) turns a single request into millions of iterations on a single-threaded
  // server. Also a sane product rule - a slot handed over for longer than this is a roster
  // change, not a replacement.
  const maxEndDate = maxEndDateFor(startDate);
  if (endDate.getTime() > maxEndDate.getTime()) {
    throw new Error(
      `A replacement can run for at most ${MAX_REPLACEMENT_MONTHS} months - for this start date, the latest end date is ${toDateOnlyString(maxEndDate)}`
    );
  }
  return { startDate, endDate };
}

export function requireRecurringSchedule(squad: { schedule: unknown }): SquadScheduleData {
  const schedule = squad.schedule as SquadScheduleData | null;
  if (!schedule || !schedule.isRecurring) {
    throw new Error(
      "This squad's playing schedule isn't configured yet - set it up in squad settings before creating a replacement"
    );
  }
  return schedule;
}

// countPlayingDaysBetween is (fromExclusive, toInclusive] - pass the day before startDate so the
// range's own start date is included if it's a playing day.
export function countWindowPlayingDays(schedule: SquadScheduleData, startDate: Date, endDate: Date): number {
  return countPlayingDaysBetween(schedule, addUtcDays(startDate, -1), endDate);
}

function requireMinimumPlayingDays(schedule: SquadScheduleData, startDate: Date, endDate: Date): number {
  const playingDays = countWindowPlayingDays(schedule, startDate, endDate);
  if (playingDays < MIN_REPLACEMENT_PLAYING_DAYS) {
    throw new Error(
      `The selected dates cover only ${playingDays} playing day(s) - a replacement needs at least ${MIN_REPLACEMENT_PLAYING_DAYS}`
    );
  }
  return playingDays;
}

export interface ReplacementWindowPreview {
  ok: boolean;
  error: string | null;
  playingDays: number;
  playingDates: string[];
  minPlayingDays: number;
  maxEndDate: string | null;
}

// What the nomination form calls as the user picks dates, so it can say "2 playing days selected,
// need 3" before they submit rather than after. Returns validation failures as data instead of
// throwing - this is a preview, not a write, and the form wants to render the reason.
export async function previewReplacementWindow(
  squadId: number,
  startDateString: string,
  endDateString: string
): Promise<ReplacementWindowPreview> {
  const empty = { playingDays: 0, playingDates: [], minPlayingDays: MIN_REPLACEMENT_PLAYING_DAYS };
  let startDate: Date;
  let endDate: Date;
  try {
    ({ startDate, endDate } = parseReplacementWindow(startDateString, endDateString));
  } catch (error) {
    // maxEndDate is still useful to the form here (it's what bounds the picker), but only once
    // the start date itself parsed.
    const parsedStart = parseDateOnly(startDateString);
    const maxEndDate = Number.isNaN(parsedStart.getTime()) ? null : toDateOnlyString(maxEndDateFor(parsedStart));
    return { ...empty, ok: false, error: (error as Error).message, maxEndDate };
  }

  const maxEndDate = toDateOnlyString(maxEndDateFor(startDate));
  const squad = await prisma.squad.findUniqueOrThrow({ where: { id: squadId } });
  let schedule: SquadScheduleData;
  try {
    schedule = requireRecurringSchedule(squad);
  } catch (error) {
    return { ...empty, ok: false, error: (error as Error).message, maxEndDate };
  }

  const playingDates = getPlayingDatesInRange(schedule, startDate, endDate).map(toDateOnlyString);
  const playingDays = playingDates.length;
  return {
    ok: playingDays >= MIN_REPLACEMENT_PLAYING_DAYS,
    error:
      playingDays >= MIN_REPLACEMENT_PLAYING_DAYS
        ? null
        : `The selected dates cover only ${playingDays} playing day(s) - a replacement needs at least ${MIN_REPLACEMENT_PLAYING_DAYS}`,
    playingDays,
    playingDates,
    minPlayingDays: MIN_REPLACEMENT_PLAYING_DAYS,
    maxEndDate,
  };
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

  const { startDate, endDate } = parseReplacementWindow(input.startDate, input.endDate);

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

  const schedule = requireRecurringSchedule(squad);
  requireMinimumPlayingDays(schedule, startDate, endDate);

  // Overlap check + insert in one transaction (MySQL can't express "no overlapping ranges" as a
  // constraint) so two concurrent nominations for the same slot/player can't both pass.
  //
  // The same transaction reconciles any live game-day check-in covering the window
  // (ATTENDANCE_VOTE_PLAN.md, "Eligibility is live"): the owner's slot - and so their right to
  // vote - moves to the replacement on those dates. Its vacancy posts go out after commit.
  const { replacement, plans } = await prisma.$transaction(async (tx) => {
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

    const created = await tx.slotReplacement.create({
      data: {
        squadId,
        fulltimePlayerId,
        replacementPlayerId,
        startDate,
        endDate,
        createdByEmail: createdByEmail.toLowerCase(),
      },
    });
    const plans = await reconcileSlotTransfer(tx, {
      squadId,
      outgoingPlayerId: fulltimePlayerId,
      incomingPlayerId: replacementPlayerId,
      fromDate: startDate,
      toDate: endDate,
    });
    // A one-day hand-off already announced to the open-slot group must not be silently undone by
    // a period window (SINGLE_DAY_NOMINATION_PLAN.md, Decision 7). Checked AFTER the reconcile
    // above has locked the live game days in range - nominations are only written under those
    // locks - and throwing rolls the whole transaction back, reconciliation included.
    const blocked = await findBlockingNomination(tx, {
      squadId,
      ownerId: fulltimePlayerId,
      replacementId: replacementPlayerId,
      fromDate: startDate,
      toDate: endDate,
    });
    if (blocked) {
      throw new Error(blocked);
    }
    return { replacement: created, plans };
  }, GAME_DAY_TX_OPTIONS);
  await deliverVacancyPlans(plans);
  return replacement;
}

// Only the nominating fulltime player can request to end their own nomination early - creation
// stays self-service, but ending one early now needs admin approval (see request/approve/reject
// below), so admins get an actionable view (the admin players page) rather than a read-only one.
async function ownReplacementOrThrow(squadId: number, id: number, requestedByEmail: string) {
  const replacement = await prisma.slotReplacement.findUnique({
    where: { id },
    include: { fulltimePlayer: true },
  });
  if (!replacement || replacement.squadId !== squadId) {
    throw new Error('Replacement not found');
  }
  if (replacement.fulltimePlayer.email.toLowerCase() !== requestedByEmail.toLowerCase()) {
    throw new Error('Only the nominating player can change this replacement');
  }
  return replacement;
}

function requireNoPendingCancellationRequest(replacement: SlotReplacement) {
  if (replacement.cancellationRequestedAt) {
    throw new Error('A cancellation request is already pending admin approval for this replacement');
  }
}

// Requests outright early cancellation - no longer applied immediately. An admin has to approve
// it (approveCancellationRequest) before cancelledAt is actually set; see
// docs/squad-tenancy.md's "Open-slot & replacement players".
export async function requestCancelReplacementCancellation(
  squadId: number,
  id: number,
  requestedByEmail: string
): Promise<SlotReplacement> {
  const replacement = await ownReplacementOrThrow(squadId, id, requestedByEmail);
  if (replacement.cancelledAt) {
    return replacement;
  }
  requireNoPendingCancellationRequest(replacement);
  return prisma.slotReplacement.update({
    where: { id },
    data: { cancellationRequestedAt: new Date(), cancellationRequestedEndDate: null },
  });
}

// The other half of "cancel/shorten early" (OPEN_SLOT_PLAYERS_PLAN.md): request pulling the end
// date in without ending the window outright. Deliberately *not* subject to the 3-playing-day
// minimum - that rule exists to stop someone claiming a slot for a token period, and shortening
// can only ever reduce a commitment that already cleared it. Outright cancellation is allowed
// too, so requiring 3 days here would be the odd rule out. Like cancellation, this now only
// records a *request*; approveCancellationRequest applies it.
export async function requestReplacementShortening(
  squadId: number,
  id: number,
  requestedByEmail: string,
  newEndDateString: string
): Promise<SlotReplacement> {
  const replacement = await ownReplacementOrThrow(squadId, id, requestedByEmail);
  if (replacement.cancelledAt) {
    throw new Error('This replacement has already been cancelled');
  }
  requireNoPendingCancellationRequest(replacement);

  const newEndDate = parseDateOnly(newEndDateString);
  if (Number.isNaN(newEndDate.getTime())) {
    throw new Error('Invalid end date');
  }
  if (newEndDate.getTime() > replacement.endDate.getTime()) {
    throw new Error('A replacement can only be shortened, not extended - cancel and re-nominate instead');
  }
  if (newEndDate.getTime() < replacement.startDate.getTime()) {
    throw new Error('The new end date is before the window started - cancel it instead');
  }

  return prisma.slotReplacement.update({
    where: { id },
    data: { cancellationRequestedAt: new Date(), cancellationRequestedEndDate: newEndDate },
  });
}

async function pendingRequestOrThrow(squadId: number, id: number) {
  const replacement = await prisma.slotReplacement.findUnique({ where: { id } });
  if (!replacement || replacement.squadId !== squadId) {
    throw new Error('Replacement not found');
  }
  if (!replacement.cancellationRequestedAt) {
    throw new Error('This replacement has no pending cancellation request');
  }
  return replacement;
}

// Admin-only (enforced by the API route, not here - matches the rest of this module leaving
// authorization to the caller). Applies the player's pending request: outright cancellation if
// no shortened end date was requested, otherwise pulls the end date in.
//
// Both outcomes hand the slot back to its owner on the dates the window no longer covers - every
// date for a cancellation, only those after the new end date for a shorten (which never sets
// cancelledAt, so it has to be reconciled explicitly too) - and reconcile any live game-day
// check-in on those dates in the same transaction.
export async function approveCancellationRequest(squadId: number, id: number): Promise<SlotReplacement> {
  const replacement = await pendingRequestOrThrow(squadId, id);
  const isShortenRequest = replacement.cancellationRequestedEndDate !== null;
  const { updated, plans } = await prisma.$transaction(async (tx) => {
    const updated = await tx.slotReplacement.update({
      where: { id },
      data: {
        cancelledAt: isShortenRequest ? undefined : new Date(),
        endDate: isShortenRequest ? replacement.cancellationRequestedEndDate! : undefined,
        cancellationRequestedAt: null,
        cancellationRequestedEndDate: null,
      },
    });
    let plans: VacancyPlan[] = [];
    const fromDate = isShortenRequest ? addUtcDays(replacement.cancellationRequestedEndDate!, 1) : replacement.startDate;
    if (replacement.cancelledAt === null && fromDate.getTime() <= replacement.endDate.getTime()) {
      plans = await reconcileSlotTransfer(tx, {
        squadId,
        outgoingPlayerId: replacement.replacementPlayerId,
        incomingPlayerId: replacement.fulltimePlayerId,
        fromDate,
        toDate: replacement.endDate,
      });
    }
    return { updated, plans };
  }, GAME_DAY_TX_OPTIONS);
  await deliverVacancyPlans(plans);
  return updated;
}

// Admin-only. Declines the player's pending request - the replacement continues on its original
// terms, nothing else changes.
export async function rejectCancellationRequest(squadId: number, id: number): Promise<SlotReplacement> {
  await pendingRequestOrThrow(squadId, id);
  return prisma.slotReplacement.update({
    where: { id },
    data: { cancellationRequestedAt: null, cancellationRequestedEndDate: null },
  });
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
  // Masked, never the raw address. This endpoint is open to any signed-in squad member, whereas
  // real email addresses are otherwise only served behind requireSquadAdmin (getSecurePlayers).
  // The picker only needs enough to tell two same-named players apart, which this gives it.
  maskedEmail: string;
}

// "amanda@example.com" -> "amand***@example.com". The local part is what identifies a person, so
// that is what gets hidden (beyond a 5-character prefix - enough to disambiguate similarly-named
// players without handing out the full address); the domain stays because it is usually the
// disambiguating part in a friend group (personal vs work address).
export function maskEmail(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0) return '***';
  const visible = email.slice(0, Math.min(5, atIndex));
  return `${visible}***${email.slice(atIndex)}`;
}

// Name-or-email search for the nomination UI's player picker. Matching still runs against the
// real address server-side - someone who knows the address can find the player by typing it,
// they just never receive it back.
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
  return players.map((p) => ({ id: p.id, name: p.name, maskedEmail: maskEmail(p.email) }));
}
