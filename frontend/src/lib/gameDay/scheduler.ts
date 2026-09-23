// The game-day check-in scheduler (ATTENDANCE_VOTE_PLAN.md, "Scheduler"), ticked every 5 minutes
// by instrumentation.ts. Not a fixed daily cron: the thresholds are wall-clock times in each
// squad's own zone, so no single UTC cron could hit 09:00/10:00/13:00 for every squad, and a
// fixed-time one would drift an hour twice a year with DST.
//
// A tick has two passes over DIFFERENT sets of rows:
//   Pass A - creation (and cancellation), over candidate DATES for each configured squad.
//   Pass B - the message and deadline steps, over every existing live GAME DAY - rows created
//            on earlier ticks, which is the whole point.
// The pure decision functions (candidateDates, buildGameDaySnapshot, decideGameDayActions,
// decideOpenSlotPing) carry all the threshold logic, so it is testable without cron, env or fetch.
import type { GameDay, Prisma, Squad } from '@prisma/client';
import prisma from '@/lib/prisma';
import { parseGameDayOps, type GameDayOpsData } from '@/lib/gameDayOps';
import { isPlayingDay } from '@/lib/scheduling/playingDayCalculator';
import { scheduleTimezone, type SquadScheduleData } from '@/lib/squadSchedule';
import { addCalendarDays, dateOnlyFromIso, isoFromDateOnly, localDateIso } from './clock';
import { computeGameDayCounts } from './counts';
import { loadGameDayState } from './eligibility';
import { cancelGameDay, closeVoting } from './lifecycle';
import { GAME_DAY_TX_OPTIONS, lockGameDay, withGameDayLock } from './lock';
import { endFinishedSessionNominations } from './nominations';
import { syncUnsettledNominationPosts } from './nominationPosts';
import { buildOpenSlotPingMessage, buildReminderMessage, buildVoteOpenMessage } from './notifications';
import { deliverVacancyPlan, planVacancySync } from './openSlots';
import { logSend, messageContextFor, sendGameDayPost, type SendOutcome } from './telegram';
import { resolveGameDayInstants, type GameDayClock } from './voteWindow';

// ---- pure ----------------------------------------------------------------------------------

// Every squad-local date from today through today + daysAhead. "Today" is the squad's
// wall-clock date, not UTC (at 00:30 in Amsterdam UTC is still on yesterday), and dates step by
// calendar day, never by 24h multiples of an instant. Scanning the whole window rather than the
// single date daysAhead out is what lets any tick within the window recover a session a
// process outage would otherwise have lost permanently.
export function candidateDates(now: Date, timezone: string, daysAhead: number): string[] {
  const today = localDateIso(now, timezone);
  return Array.from({ length: daysAhead + 1 }, (_, i) => addCalendarDays(today, i));
}

export interface GameDaySnapshot {
  gameDate: Date;
  startTime: string;
  endTime: string;
  timezone: string;
  minPlayers: number | null;
  votesCloseAt: Date;
  slotLockAt: Date;
}

// The published promise: times, zone and minimum captured at creation and never re-read.
export function buildGameDaySnapshot(
  schedule: SquadScheduleData,
  ops: GameDayOpsData,
  gameDate: string
): GameDaySnapshot {
  const clock: GameDayClock = {
    gameDate,
    startTime: schedule.startTime!,
    endTime: schedule.endTime!,
    timezone: scheduleTimezone(schedule),
  };
  const { votesCloseAt, slotLockAt } = resolveGameDayInstants(clock);
  return {
    gameDate: dateOnlyFromIso(gameDate),
    startTime: clock.startTime,
    endTime: clock.endTime,
    timezone: clock.timezone,
    minPlayers: ops.minPlayersForOpenSlot,
    votesCloseAt,
    slotLockAt,
  };
}

export function clockOf(gameDay: Pick<GameDay, 'gameDate' | 'startTime' | 'endTime' | 'timezone'>): GameDayClock {
  return {
    gameDate: isoFromDateOnly(gameDay.gameDate),
    startTime: gameDay.startTime,
    endTime: gameDay.endTime,
    timezone: gameDay.timezone,
  };
}

// 'send' = due and in time; 'skip' = due but its window has passed (stamp it, never send late);
// null = not due, or already stamped.
export type StepDecision = 'send' | 'skip' | null;

export interface GameDayActions {
  announce: StepDecision;
  ping: StepDecision; // 'send' still subject to decideOpenSlotPing
  remind: StepDecision;
  close: boolean;
  sync: boolean;
}

type DecisionRow = Pick<
  GameDay,
  | 'status'
  | 'gameDate'
  | 'startTime'
  | 'endTime'
  | 'timezone'
  | 'votesCloseAt'
  | 'slotLockAt'
  | 'announcedAt'
  | 'remindedAt'
  | 'openSlotPingedAt'
>;

// The guard for each step is "threshold passed AND stamp is null", bounded ABOVE by the
// deadline: after a long outage, a tick at 18:00 must not send "please vote" and then close
// voting in the same breath, nor fire the 09:00 ping after the session started. Closing is the
// only step with no upper bound, because closing late is still correct.
export function decideGameDayActions(gameDay: DecisionRow, now: Date): GameDayActions {
  const open = gameDay.status === 'VOTING_OPEN';
  const beforeClose = now.getTime() < gameDay.votesCloseAt.getTime();
  const { openSlotPingAt, reminderAt } = resolveGameDayInstants(clockOf(gameDay));
  const due = (stamp: Date | null, threshold?: Date): StepDecision => {
    if (!open || stamp !== null) return null;
    if (threshold && now.getTime() < threshold.getTime()) return null;
    return beforeClose ? 'send' : 'skip';
  };
  return {
    announce: due(gameDay.announcedAt),
    ping: due(gameDay.openSlotPingedAt, openSlotPingAt),
    remind: due(gameDay.remindedAt, reminderAt),
    close: open && !beforeClose,
    sync: gameDay.status === 'VOTING_CLOSED' && now.getTime() < gameDay.slotLockAt.getTime(),
  };
}

// The 09:00 ping additionally needs the minimum configured and confirmedIn below it. A skip
// reason is logged and the stamp set either way, so a decided-not-to-send never retries.
export function decideOpenSlotPing(input: {
  minPlayers: number | null;
  confirmedIn: number;
}): { send: true } | { send: false; reason: string } {
  if (input.minPlayers === null) return { send: false, reason: 'no open-slot minimum on this game day' };
  if (input.confirmedIn >= input.minPlayers) {
    return { send: false, reason: `already ${input.confirmedIn}/${input.minPlayers} confirmed` };
  }
  return { send: true };
}

// ---- impure --------------------------------------------------------------------------------

export interface TickSummary {
  created: number;
  recreated: number;
  cancelled: number;
  closed: number;
  nominationsEnded: number;
  errors: number;
  skipped?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __gameDayTickInProgress: boolean | undefined;
}

const OFF_SCHEDULE_REASON = 'The session was taken off the schedule.';
const CHECK_IN_OFF_REASON = 'Game-day check-in was turned off for this squad.';

function isSquadRunningCheckIn(squad: Squad): { schedule: SquadScheduleData; ops: GameDayOpsData } | null {
  const schedule = squad.schedule as SquadScheduleData | null;
  const ops = parseGameDayOps(squad.gameDayOps);
  if (!squad.enabled || !ops || !schedule?.isRecurring || !schedule.startTime || !schedule.endTime) return null;
  return { schedule, ops };
}

// A CANCELLED row whose date is back on the schedule (a skipDate removed) is re-created in
// place - a fresh vote, fresh stamps, a fresh snapshot - rather than un-cancelled (resolved open
// question 6). In place because (squadId, gameDate) is unique; "re-created" means nothing of the
// old row survives. Never when a Game was already planned from it.
async function recreateCancelledGameDay(gameDayId: number, snapshot: GameDaySnapshot): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const gameDay = await lockGameDay(tx, gameDayId);
    if (!gameDay || gameDay.status !== 'CANCELLED') return false;
    if (await tx.game.findUnique({ where: { gameDayId } })) return false;
    await tx.gameDayVote.deleteMany({ where: { gameDayId } });
    await tx.gameDayOpenSlot.deleteMany({ where: { gameDayId } });
    // Already ended GAME_DAY_CANCELLED by cancelGameDay; deleted so nothing of the old row
    // survives, including a hand-off the fresh vote never saw.
    await tx.gameDaySlotNomination.deleteMany({ where: { gameDayId } });
    await tx.gameDay.update({
      where: { id: gameDayId },
      data: {
        ...snapshot,
        status: 'VOTING_OPEN',
        announcedAt: null,
        remindedAt: null,
        openSlotPingedAt: null,
        openSlotPingSent: false,
        votingClosedAt: null,
        announcedVacancies: null,
      },
    });
    return true;
  }, GAME_DAY_TX_OPTIONS);
}

// Pass A for one squad: create what should exist, cancel open rows that should not.
async function runCreationPass(squad: Squad, now: Date, summary: TickSummary): Promise<void> {
  const running = isSquadRunningCheckIn(squad);
  const openRows = await prisma.gameDay.findMany({ where: { squadId: squad.id, status: 'VOTING_OPEN' } });

  if (!running) {
    // Normally already cancelled by the handler that switched the squad or its check-in off
    // (cancelOpenGameDays); this is the backstop that guarantees no open row is stranded.
    for (const row of openRows) {
      if (await cancelGameDay(row.id, squad.enabled ? CHECK_IN_OFF_REASON : 'The squad was disabled.')) summary.cancelled++;
    }
    return;
  }
  const { schedule, ops } = running;

  // Cancellation first, so a day cancelled at 08:58 cannot still get its 09:00 ping - Pass B
  // runs after this and only sees rows that are still open.
  for (const row of openRows) {
    if (!isPlayingDay(schedule, row.gameDate)) {
      if (await cancelGameDay(row.id, OFF_SCHEDULE_REASON)) summary.cancelled++;
    }
  }

  for (const date of candidateDates(now, scheduleTimezone(schedule), ops.voteOpensDaysBefore)) {
    const gameDate = dateOnlyFromIso(date);
    if (!isPlayingDay(schedule, gameDate)) continue;
    const snapshot = buildGameDaySnapshot(schedule, ops, date);
    // A row created after its own deadline could only ever be a closed vote nobody could join.
    if (now.getTime() >= snapshot.votesCloseAt.getTime()) continue;

    const existing = await prisma.gameDay.findUnique({ where: { squadId_gameDate: { squadId: squad.id, gameDate } } });
    if (existing?.status === 'CANCELLED') {
      if (await recreateCancelledGameDay(existing.id, snapshot)) summary.recreated++;
      continue;
    }
    if (existing) continue;
    // NOT an upsert with an update clause: that would rewrite the published clock every five
    // minutes for as long as the vote is open. The conflict path is a no-op.
    const data: Prisma.GameDayUncheckedCreateInput = { squadId: squad.id, ...snapshot };
    await prisma.gameDay.upsert({
      where: { squadId_gameDate: { squadId: squad.id, gameDate } },
      create: data,
      update: {},
    });
    summary.created++;
  }
}

async function stamp(
  gameDayId: number,
  field: 'announcedAt' | 'openSlotPingedAt' | 'remindedAt',
  now: Date,
  extra: Prisma.GameDayUpdateManyMutationInput = {}
) {
  await prisma.gameDay.updateMany({ where: { id: gameDayId, [field]: null }, data: { [field]: now, ...extra } });
}

// Sent or deliberately skipped -> stamp; failed -> leave the stamp unset so the next tick retries
// (until the deadline turns it into a skip).
function shouldStamp(outcome: SendOutcome): boolean {
  return outcome.status !== 'failed';
}

// Pass B for one game day row.
async function runStepsPass(gameDay: GameDay & { squad: Squad }, now: Date, summary: TickSummary): Promise<void> {
  const { squad } = gameDay;
  const actions = decideGameDayActions(gameDay, now);
  const ctx = messageContextFor(gameDay, squad);
  const label = `game day ${gameDay.id} (${isoFromDateOnly(gameDay.gameDate)})`;

  if (actions.announce === 'skip') {
    console.log(`[game-day] ${squad.slug}: skipped announcement for ${label} (past the deadline)`);
    await stamp(gameDay.id, 'announcedAt', now);
  } else if (actions.announce === 'send') {
    const outcome = await sendGameDayPost(squad, 'main', buildVoteOpenMessage(ctx));
    logSend(squad, `announcement for ${label}`, outcome);
    if (shouldStamp(outcome)) await stamp(gameDay.id, 'announcedAt', now);
  }

  if (actions.ping !== null || actions.remind === 'send') {
    const counts = computeGameDayCounts(await loadGameDayState(prisma, gameDay));

    if (actions.ping === 'skip') {
      console.log(`[game-day] ${squad.slug}: skipped open-slot ping for ${label} (past the deadline)`);
      await stamp(gameDay.id, 'openSlotPingedAt', now);
    } else if (actions.ping === 'send') {
      const verdict = decideOpenSlotPing({ minPlayers: gameDay.minPlayers, confirmedIn: counts.confirmedIn });
      if (!verdict.send) {
        console.log(`[game-day] ${squad.slug}: skipped open-slot ping for ${label} (${verdict.reason})`);
        await stamp(gameDay.id, 'openSlotPingedAt', now);
      } else {
        const outcome = await sendGameDayPost(
          squad,
          'openSlot',
          buildOpenSlotPingMessage(ctx, { confirmedIn: counts.confirmedIn, minPlayers: gameDay.minPlayers! })
        );
        logSend(squad, `open-slot ping for ${label}`, outcome);
        if (shouldStamp(outcome)) {
          await stamp(gameDay.id, 'openSlotPingedAt', now, { openSlotPingSent: outcome.status === 'sent' });
        }
      }
    }

    if (actions.remind === 'send') {
      const outcome = await sendGameDayPost(
        squad,
        'main',
        buildReminderMessage(ctx, { confirmedIn: counts.confirmedIn, minPlayers: gameDay.minPlayers })
      );
      logSend(squad, `reminder for ${label}`, outcome);
      if (shouldStamp(outcome)) await stamp(gameDay.id, 'remindedAt', now);
    }
  }
  if (actions.remind === 'skip') {
    console.log(`[game-day] ${squad.slug}: skipped reminder for ${label} (past the deadline)`);
    await stamp(gameDay.id, 'remindedAt', now);
  }

  if (actions.close) {
    if (await closeVoting(gameDay.id, now)) summary.closed++;
  } else if (actions.sync) {
    // The retry path for a lost vacancy post. No special case needed: after a successful send
    // announcedVacancies has advanced, so the plan comes back unchanged and this is a no-op; a
    // failed one has not, so this retries it. Stops by itself at slotLockAt.
    const plan = await withGameDayLock(gameDay.id, (tx) => planVacancySync(tx, gameDay.id, now));
    await deliverVacancyPlan(plan);
  }
}

export async function runGameDayTick(now: Date = new Date()): Promise<TickSummary> {
  const summary: TickSummary = { created: 0, recreated: 0, cancelled: 0, closed: 0, nominationsEnded: 0, errors: 0 };
  // Ticks never overlap in-process: a slow tick (Telegram timing out) must not let the next one
  // send the same one-shot message before the first has stamped it.
  if (global.__gameDayTickInProgress) {
    return { ...summary, skipped: 'previous tick still running' };
  }
  global.__gameDayTickInProgress = true;
  try {
    const squads = await prisma.squad.findMany();

    // Each squad's pass is separately wrapped, so one squad's failure - a revoked chat id, a
    // Telegram outage, a bad config blob - cannot abort the sweep for the others, and a
    // creation failure cannot stop that same squad's votes from closing.
    for (const squad of squads) {
      try {
        await runCreationPass(squad, now, summary);
      } catch (error) {
        summary.errors++;
        console.error(`[game-day] ${squad.slug}: creation pass failed`, error);
      }
    }

    const live = await prisma.gameDay.findMany({
      where: { OR: [{ status: 'VOTING_OPEN' }, { status: 'VOTING_CLOSED', slotLockAt: { gt: now } }] },
      include: { squad: true },
      orderBy: [{ squadId: 'asc' }, { gameDate: 'asc' }],
    });
    for (const gameDay of live) {
      try {
        await runStepsPass(gameDay, now, summary);
      } catch (error) {
        summary.errors++;
        console.error(`[game-day] ${gameDay.squad.slug}: steps pass failed for game day ${gameDay.id}`, error);
      }
    }

    // One-day slot nominations (SINGLE_DAY_NOMINATION_PLAN.md): end the ones whose session is
    // over - a frozen hand-off has no other way to end, and would otherwise block a period
    // replacement for good - then retry any hand-off post that has not landed. Its own step: Pass B
    // stops looking at a game day at slotLockAt, hours before its session ends. Both wrap their
    // own per-row failures, so neither can abort the other.
    try {
      summary.nominationsEnded = await endFinishedSessionNominations(now);
    } catch (error) {
      summary.errors++;
      console.error('[game-day] session-end step for slot nominations failed', error);
    }
    await syncUnsettledNominationPosts(now);
    return summary;
  } finally {
    global.__gameDayTickInProgress = false;
  }
}
