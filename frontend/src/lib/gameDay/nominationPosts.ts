// What the open-slot group is told about one-day slot nominations (SINGLE_DAY_NOMINATION_PLAN.md,
// "Telegram"). Not a post per row: a switch writes two rows but is one post, and retrying rows one
// by one would turn a single failed switch into "now goes to Carol instead of Bob" AND "no longer
// passed to Bob". So the sync compares, per nominator and game day, what the group was last told
// (K) with what is true now (T), and posts only the difference:
//
//   K = the nominee of the row with announcedAt set and retractedAt null (at most one)
//   T = the nominee of the active row, or of the one ended SESSION_ENDED
//
// announcedAt is only ever set by a real send (or carried over to a new row for the same person
// the group was already told about); retractedAt is set by a sent post or a deliberate silent
// settle. A row still needing attention ("unsettled") is derivable, so there is no extra column:
// an active row with announcedAt null, or a row ended early with announcedAt set and retractedAt
// null.
import type { GameDaySlotNomination, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isoFromDateOnly } from './clock';
import { buildNominationMessage, type NominationMessageInput } from './notifications';
import { chatIdFor, logSend, messageContextFor, sendGameDayPost } from './telegram';
import { sessionPhase } from './voteWindow';

type NominationRow = Pick<
  GameDaySlotNomination,
  'id' | 'nomineePlayerId' | 'endedAt' | 'endReason' | 'announcedAt' | 'retractedAt'
>;

export type NominationPostKind = NominationMessageInput['kind'];

export interface NominationPostPlan {
  // Null when nothing is posted - either nothing changed, or the change is settled silently.
  post: { kind: NominationPostKind; nomineeId: number | null; previousNomineeId: number | null } | null;
  // Applied on a successful send, or straight away when there is no post.
  announceRowId: number | null;
  retractRowIds: number[];
}

// Pure: one nominator's rows on one game day. `silent` = the game day is cancelled (the main-group
// cancellation post covers it) or its session is over - the group's picture is brought into line
// without posting anything.
export function planNominationPost(rows: NominationRow[], silent: boolean): NominationPostPlan {
  const told = rows
    .filter((r) => r.announcedAt !== null && r.retractedAt === null)
    .sort((a, b) => b.id - a.id);
  const k = told[0] ?? null;
  const t =
    rows.find((r) => r.endedAt === null) ?? rows.find((r) => r.endReason === 'SESSION_ENDED') ?? null;
  // Any other stale "told" rows (defensive - K is at most one when the stamps are applied as
  // below) are retracted along with K.
  const staleTold = told.slice(1).map((r) => r.id);
  const nothing: NominationPostPlan = { post: null, announceRowId: null, retractRowIds: staleTold };

  if (k === null && t === null) return nothing;
  if (k !== null && t !== null && k.nomineePlayerId === t.nomineePlayerId) {
    // The group already knows this person is playing. Same row: nothing to do. A new row for the
    // same person (switched away and back before any post landed): the knowledge carries over.
    return k.id === t.id ? nothing : { post: null, announceRowId: t.id, retractRowIds: [k.id, ...staleTold] };
  }
  if (silent) {
    return { post: null, announceRowId: null, retractRowIds: k ? [k.id, ...staleTold] : staleTold };
  }
  if (k === null) {
    return { post: { kind: 'CREATED', nomineeId: t!.nomineePlayerId, previousNomineeId: null }, announceRowId: t!.id, retractRowIds: staleTold };
  }
  if (t === null) {
    return { post: { kind: 'ENDED', nomineeId: null, previousNomineeId: k.nomineePlayerId }, announceRowId: null, retractRowIds: [k.id, ...staleTold] };
  }
  return {
    post: { kind: 'SWITCHED', nomineeId: t.nomineePlayerId, previousNomineeId: k.nomineePlayerId },
    announceRowId: t.id,
    retractRowIds: [k.id, ...staleTold],
  };
}

async function applyStamps(plan: NominationPostPlan, now: Date): Promise<void> {
  if (plan.announceRowId !== null) {
    await prisma.gameDaySlotNomination.updateMany({ where: { id: plan.announceRowId, announcedAt: null }, data: { announcedAt: now } });
  }
  if (plan.retractRowIds.length > 0) {
    await prisma.gameDaySlotNomination.updateMany({
      where: { id: { in: plan.retractRowIds }, retractedAt: null },
      data: { retractedAt: now },
    });
  }
}

// After commit - never inside a game day's lock, since it calls Telegram. On a failed send the
// stamps are left alone, so the scheduler's next tick retries it. With no open-slot chat id it is
// a no-op: nothing retries, and a chat id configured later announces a still-live hand-off then.
export async function syncNominationPosts(gameDayId: number, nominatorId: number, now: Date = new Date()): Promise<void> {
  try {
    const gameDay = await prisma.gameDay.findUnique({ where: { id: gameDayId }, include: { squad: true } });
    if (!gameDay || !chatIdFor(gameDay.squad, 'openSlot')) return;

    const rows = await prisma.gameDaySlotNomination.findMany({
      where: { gameDayId, nominatorPlayerId: nominatorId },
      orderBy: { id: 'asc' },
    });
    const silent =
      gameDay.status === 'CANCELLED' ||
      sessionPhase(
        { gameDate: isoFromDateOnly(gameDay.gameDate), startTime: gameDay.startTime, endTime: gameDay.endTime, timezone: gameDay.timezone },
        now
      ) === 'ended';
    const plan = planNominationPost(rows, silent);
    if (!plan.post) {
      await applyStamps(plan, now);
      return;
    }

    const ids = [nominatorId, plan.post.nomineeId, plan.post.previousNomineeId].filter((id): id is number => id !== null);
    const players = await prisma.player.findMany({ where: { id: { in: ids } } });
    const name = (id: number | null) => players.find((p) => p.id === id)?.name ?? 'someone';
    const nominatorName = name(nominatorId);
    const input: NominationMessageInput =
      plan.post.kind === 'CREATED'
        ? { kind: 'CREATED', nominatorName, nomineeName: name(plan.post.nomineeId) }
        : plan.post.kind === 'SWITCHED'
          ? { kind: 'SWITCHED', nominatorName, nomineeName: name(plan.post.nomineeId), previousNomineeName: name(plan.post.previousNomineeId) }
          : { kind: 'ENDED', nominatorName, previousNomineeName: name(plan.post.previousNomineeId) };

    const outcome = await sendGameDayPost(
      gameDay.squad,
      'openSlot',
      buildNominationMessage(messageContextFor(gameDay, gameDay.squad), input)
    );
    logSend(gameDay.squad, `slot hand-off update for game day ${gameDayId}`, outcome);
    if (outcome.status === 'sent') await applyStamps(plan, now);
  } catch (error) {
    console.error(`[game-day] Failed to sync hand-off posts for player ${nominatorId} on game day ${gameDayId}`, error);
  }
}

// A SESSION_ENDED row the group was told about is the final, correct state (K = T), not an
// unsettled one - without the exclusion it would be re-checked every tick forever.
const UNSETTLED: Prisma.GameDaySlotNominationWhereInput = {
  OR: [
    { endedAt: null, announcedAt: null },
    { endedAt: { not: null }, endReason: { not: 'SESSION_ENDED' }, announcedAt: { not: null }, retractedAt: null },
  ],
};

// The retry path: every nominator with an unsettled row, optionally on one game day only. Run by
// the scheduler every tick, and after writes that end nominations for several nominators at
// once (a cancellation, a disabled player).
// Never throws: it runs after writes that have already committed.
export async function syncUnsettledNominationPosts(now: Date = new Date(), gameDayId?: number): Promise<void> {
  let rows: { gameDayId: number; nominatorPlayerId: number }[];
  try {
    rows = await prisma.gameDaySlotNomination.findMany({
      where: gameDayId === undefined ? UNSETTLED : { AND: [UNSETTLED, { gameDayId }] },
      select: { gameDayId: true, nominatorPlayerId: true },
    });
  } catch (error) {
    console.error('[game-day] Failed to look up unsent hand-off posts', error);
    return;
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.gameDayId}:${row.nominatorPlayerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await syncNominationPosts(row.gameDayId, row.nominatorPlayerId, now);
  }
}
