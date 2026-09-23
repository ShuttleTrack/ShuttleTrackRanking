// Message bodies for the game-day check-in's Telegram posts (ATTENDANCE_VOTE_PLAN.md,
// "Telegram"). Pure builders, separate from the sending, so every body can be asserted on
// without mocking fetch. Each post carries the plain link in its text AND an inline-keyboard
// button, so it works in both Telegram clients.
import { format, parseISO } from 'date-fns';
import { escapeTelegramHtml, type InlineKeyboard } from '@/lib/telegram/sendMessage';
import { VOTES_CLOSE_TIME } from './voteWindow';

export interface TelegramPost {
  text: string;
  buttons?: InlineKeyboard;
}

export interface MessageContext {
  appUrl: string; // NEXT_PUBLIC_APP_URL
  squadName: string;
  slug: string;
  gameDate: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
}

export function gameDayUrl(appUrl: string, slug: string, gameDate: string): string {
  return `${appUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(slug)}/game-day/${gameDate}`;
}

// "Wednesday 23 Sep"
export function formatGameDate(gameDate: string): string {
  return format(parseISO(gameDate), 'EEEE d MMM');
}

// Telegram rejects an inline button whose URL it considers unreachable (localhost, a bare IP
// on a dev box) and fails the WHOLE message - so a local run keeps the link in the text only.
function buttonsFor(url: string, label: string): InlineKeyboard | undefined {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return undefined;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname.includes('.')) return undefined;
  } catch {
    return undefined;
  }
  return { inline_keyboard: [[{ text: label, url }]] };
}

function sessionLine(ctx: MessageContext): string {
  return `${escapeTelegramHtml(formatGameDate(ctx.gameDate))}, ${ctx.startTime}–${ctx.endTime}`;
}

function post(ctx: MessageContext, lines: string[], buttonLabel: string): TelegramPost {
  const url = gameDayUrl(ctx.appUrl, ctx.slug, ctx.gameDate);
  return { text: [...lines, '', url].join('\n'), buttons: buttonsFor(url, buttonLabel) };
}

// Main group, on creation (voteOpensDaysBefore ahead).
export function buildVoteOpenMessage(ctx: MessageContext): TelegramPost {
  return post(
    ctx,
    [
      `🏸 <b>${escapeTelegramHtml(ctx.squadName)}</b> — ${sessionLine(ctx)}`,
      `Are you in? Vote by <b>${VOTES_CLOSE_TIME}</b> on the day.`,
    ],
    'Vote in / out'
  );
}

// Main group, 10:00 on the game day.
export function buildReminderMessage(
  ctx: MessageContext,
  counts: { confirmedIn: number; minPlayers: number | null }
): TelegramPost {
  const tally =
    counts.minPlayers === null
      ? `${counts.confirmedIn} in so far.`
      : `${counts.confirmedIn} of ${counts.minPlayers} in so far.`;
  return post(
    ctx,
    [
      `⏰ Reminder — ${sessionLine(ctx)}`,
      `${tally} Voting closes at <b>${VOTES_CLOSE_TIME}</b> today.`,
    ],
    'Vote in / out'
  );
}

// Open-slot group, 09:00 on the game day, only when confirmedIn is below the minimum.
export function buildOpenSlotPingMessage(
  ctx: MessageContext,
  counts: { confirmedIn: number; minPlayers: number }
): TelegramPost {
  const short = Math.max(0, counts.minPlayers - counts.confirmedIn);
  return post(
    ctx,
    [
      `🙋 Players needed — ${sessionLine(ctx)}`,
      `${counts.confirmedIn} of ${counts.minPlayers} confirmed so far (${short} short). Join the waiting list — slots are handed out in join order when voting closes at ${VOTES_CLOSE_TIME}.`,
    ],
    'Join the waiting list'
  );
}

export interface VacancyMessageInput {
  promotedNames: string[];
  remaining: number;
  // What the open-slot group was last told (GameDay.announcedVacancies) - null before the first
  // post.
  previouslyAnnounced: number | null;
  // Whether the 09:00 "players needed" ping actually went out (GameDay.openSlotPingSent).
  pingSent: boolean;
}

// Open-slot group, from the vacancy sync. Four messages (the plan's table); null when there is
// genuinely nothing to tell the group - the session filled, but they were never asked for help.
export function buildVacancyMessage(ctx: MessageContext, input: VacancyMessageInput): TelegramPost | null {
  const names = input.promotedNames.map((n) => escapeTelegramHtml(n)).join(', ');
  const { remaining } = input;
  const slots = (n: number) => `${n} ${n === 1 ? 'spot' : 'spots'}`;

  if (input.promotedNames.length > 0 && remaining > 0) {
    return post(ctx, [`✅ ${names} ${input.promotedNames.length === 1 ? 'is' : 'are'} in for ${sessionLine(ctx)}.`, `${slots(remaining)} still open — first come, first served.`], 'Claim a slot');
  }
  if (input.promotedNames.length > 0) {
    return post(ctx, [`✅ ${names} ${input.promotedNames.length === 1 ? 'is' : 'are'} in for ${sessionLine(ctx)}.`, 'The session is full.'], 'See who is playing');
  }
  if (remaining > 0) {
    return post(ctx, [`📣 ${remaining} open ${remaining === 1 ? 'slot' : 'slots'} for ${sessionLine(ctx)}.`, 'First come, first served.'], 'Claim a slot');
  }
  // Nobody promoted, nothing open. Only worth saying to a group that was asked: without this the
  // common case - pinged at 09:00, everyone votes in by 13:00 - never tells them it filled.
  if (input.pingSent || (input.previouslyAnnounced ?? 0) > 0) {
    return post(ctx, [`👍 ${sessionLine(ctx)} filled up — no open slots needed. Thanks!`], 'See who is playing');
  }
  return null;
}

// Open-slot group, from the nomination post sync (SINGLE_DAY_NOMINATION_PLAN.md, "Telegram"): what
// the group now needs to hear about one fulltime player's one-day hand-off. `previousNomineeName`
// is who the group was last told - never a name it did not hear.
export type NominationMessageInput =
  | { kind: 'CREATED'; nominatorName: string; nomineeName: string }
  | { kind: 'SWITCHED'; nominatorName: string; nomineeName: string; previousNomineeName: string }
  | { kind: 'ENDED'; nominatorName: string; previousNomineeName: string };

export function buildNominationMessage(ctx: MessageContext, input: NominationMessageInput): TelegramPost {
  const nominator = escapeTelegramHtml(input.nominatorName);
  const slot = `${nominator}'s slot for ${sessionLine(ctx)}`;
  const line =
    input.kind === 'CREATED'
      ? `🔁 ${slot} goes to ${escapeTelegramHtml(input.nomineeName)}.`
      : input.kind === 'SWITCHED'
        ? `🔁 ${slot} now goes to ${escapeTelegramHtml(input.nomineeName)} instead of ${escapeTelegramHtml(input.previousNomineeName)}.`
        : `↩️ ${slot} is no longer passed to ${escapeTelegramHtml(input.previousNomineeName)}.`;
  return post(ctx, [line], 'See who is playing');
}

// Main group, when an already-announced game day is cancelled (resolved open question 4).
export function buildCancellationMessage(ctx: MessageContext, reason: string): TelegramPost {
  return {
    text: [`❌ ${sessionLine(ctx)} is cancelled.`, escapeTelegramHtml(reason)].filter(Boolean).join('\n'),
  };
}
