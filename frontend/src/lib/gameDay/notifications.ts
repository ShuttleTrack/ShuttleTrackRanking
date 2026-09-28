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
export function buttonsFor(url: string, label: string): InlineKeyboard | undefined {
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
  const lines = [
    `Are you in for ${sessionLine(ctx)}?`,
    `Vote by <b>${VOTES_CLOSE_TIME}</b> on the game day.`,
  ];
  const url = gameDayUrl(ctx.appUrl, ctx.slug, ctx.gameDate);
  const buttons = buttonsFor(url, 'Vote in / out');
  const text = buttons ? lines.join('\n') : [...lines, '', url].join('\n');
  return { text, buttons };
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
  const playerWord = short === 1 ? 'player' : 'players';
  const lines = [
    `🙋 We need <b>${short}</b> more ${playerWord} for ${sessionLine(ctx)}`,
    'Join the waiting list — first come, first served.',
  ];
  const url = gameDayUrl(ctx.appUrl, ctx.slug, ctx.gameDate);
  const buttons = buttonsFor(url, 'Join the waiting list');
  const text = buttons ? lines.join('\n') : [...lines, '', url].join('\n');
  return { text, buttons };
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
    const slotWord = remaining === 1 ? 'slot' : 'slots';
    const lines = [
      'Final call for open slots!',
      `${remaining} open ${slotWord} for ${sessionLine(ctx)}.`,
      'First come, first served.',
    ];
    const url = gameDayUrl(ctx.appUrl, ctx.slug, ctx.gameDate);
    const buttons = buttonsFor(url, 'Claim a slot');
    const text = buttons ? lines.join('\n') : [...lines, '', url].join('\n');
    return { text, buttons };
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
      ? `🔁 ${escapeTelegramHtml(input.nomineeName)} is playing for ${slot}`
      : input.kind === 'SWITCHED'
        ? `🔁 ${escapeTelegramHtml(input.nomineeName)} is playing for ${slot} instead of ${escapeTelegramHtml(input.previousNomineeName)}.`
        : `↩️ ${escapeTelegramHtml(input.previousNomineeName)} is no longer playing for ${slot}.`;
  const url = gameDayUrl(ctx.appUrl, ctx.slug, ctx.gameDate);
  const buttons = buttonsFor(url, 'See who is playing');
  const text = buttons ? line : [line, '', url].join('\n');
  return { text, buttons };
}

// Main group, when an already-announced game day is cancelled (resolved open question 4).
export function buildCancellationMessage(ctx: MessageContext, reason: string): TelegramPost {
  return {
    text: [`❌ ${sessionLine(ctx)} is cancelled.`, escapeTelegramHtml(reason)].filter(Boolean).join('\n'),
  };
}
