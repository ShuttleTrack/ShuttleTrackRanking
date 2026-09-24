// Telegram posts to a squad's admin group (Squad.adminTelegramChatId): pending admin actions - a
// join request to approve, a replacement cancellation/shorten request to decide - and important
// roster updates - a new long-term replacement. Same shared TELEGRAM_BOT_TOKEN as every other
// post; only the chat id is per-squad.
//
// Pure builders first (asserted on without mocking fetch, like lib/gameDay/notifications.ts),
// then the notifyAdminsOf* entry points the API routes call after their write has succeeded.
// Those never throw: a Telegram outage or a missing chat id must not turn a request that already
// committed into an error response.
import { format, parseISO } from 'date-fns';
import type { SlotReplacement, SquadJoinRequest } from '@prisma/client';
import prisma from '@/lib/prisma';
import { buttonsFor, type TelegramPost } from '@/lib/gameDay/notifications';
import { escapeTelegramHtml, sendTelegramMessage } from '@/lib/telegram/sendMessage';

export interface AdminMessageContext {
  appUrl: string; // NEXT_PUBLIC_APP_URL
  squadName: string;
  slug: string;
}

// Both actionable items live on the admin Players page (JoinRequestOversight,
// ReplacementOversight).
export function adminPlayersUrl(ctx: AdminMessageContext): string {
  return `${ctx.appUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(ctx.slug)}/admin/players`;
}

// A @db.Date column, which Prisma hands back as UTC midnight: "Wed 7 Oct 2026".
export function formatWindowDate(date: Date): string {
  return format(parseISO(date.toISOString().slice(0, 10)), 'EEE d MMM yyyy');
}

function withPlayersLink(ctx: AdminMessageContext, lines: string[], buttonLabel: string): TelegramPost {
  const url = adminPlayersUrl(ctx);
  return { text: [...lines, '', url].join('\n'), buttons: buttonsFor(url, buttonLabel) };
}

export interface JoinRequestMessageInput {
  name: string;
  email: string;
  message: string | null;
}

export function buildJoinRequestMessage(ctx: AdminMessageContext, input: JoinRequestMessageInput): TelegramPost {
  const lines = [
    `🙋 <b>New join request · ${escapeTelegramHtml(ctx.squadName)}</b>`,
    `${escapeTelegramHtml(input.name)} (${escapeTelegramHtml(input.email)}) asked to join the squad.`,
  ];
  if (input.message) {
    lines.push(`<i>"${escapeTelegramHtml(input.message)}"</i>`);
  }
  lines.push('Approve or reject it on the Players page.');
  return withPlayersLink(ctx, lines, 'Review request');
}

export interface ReplacementMessageInput {
  ownerName: string;
  replacementName: string;
  startDate: Date;
  endDate: Date;
}

export function buildReplacementCreatedMessage(ctx: AdminMessageContext, input: ReplacementMessageInput): TelegramPost {
  return withPlayersLink(
    ctx,
    [
      `🔁 <b>New long-term replacement · ${escapeTelegramHtml(ctx.squadName)}</b>`,
      `${escapeTelegramHtml(input.replacementName)} covers ${escapeTelegramHtml(input.ownerName)}'s slot ` +
        `from ${formatWindowDate(input.startDate)} to ${formatWindowDate(input.endDate)}.`,
    ],
    'View replacements'
  );
}

export interface CancellationRequestMessageInput extends ReplacementMessageInput {
  // null = outright cancellation; otherwise the end date the owner asked to shorten to.
  requestedEndDate: Date | null;
}

export function buildCancellationRequestMessage(
  ctx: AdminMessageContext,
  input: CancellationRequestMessageInput
): TelegramPost {
  const window = `${formatWindowDate(input.startDate)} to ${formatWindowDate(input.endDate)}`;
  const owner = escapeTelegramHtml(input.ownerName);
  const replacement = escapeTelegramHtml(input.replacementName);
  const ask = input.requestedEndDate
    ? `${owner} asks to shorten ${replacement}'s replacement (${window}) to end on ${formatWindowDate(input.requestedEndDate)}.`
    : `${owner} asks to cancel ${replacement}'s replacement (${window}).`;
  return withPlayersLink(
    ctx,
    [
      `⏳ <b>Replacement ${input.requestedEndDate ? 'shorten' : 'cancellation'} request · ${escapeTelegramHtml(ctx.squadName)}</b>`,
      ask,
      'Approve or reject it on the Players page.',
    ],
    'Review request'
  );
}

async function sendAdminPost(squadId: number, what: string, build: (ctx: AdminMessageContext) => TelegramPost) {
  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { name: true, slug: true, adminTelegramChatId: true },
  });
  if (!squad) return;
  if (!squad.adminTelegramChatId) {
    console.log(`[admin-notify] ${squad.slug}: skipped ${what} (no admin group chat id configured)`);
    return;
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error(`[admin-notify] ${squad.slug}: failed to send ${what}: TELEGRAM_BOT_TOKEN is not set`);
    return;
  }
  const post = build({ appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '', squadName: squad.name, slug: squad.slug });
  const result = await sendTelegramMessage(botToken, squad.adminTelegramChatId, post.text, post.buttons);
  if (result.ok) {
    console.log(`[admin-notify] ${squad.slug}: sent ${what}`);
  } else {
    console.error(`[admin-notify] ${squad.slug}: failed to send ${what}: ${result.description ?? 'unknown error'}`);
  }
}

async function neverThrow(what: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (error) {
    console.error(`[admin-notify] failed to send ${what}:`, error);
  }
}

async function loadReplacementNames(replacement: SlotReplacement) {
  const players = await prisma.player.findMany({
    where: { id: { in: [replacement.fulltimePlayerId, replacement.replacementPlayerId] } },
    select: { id: true, name: true },
  });
  const nameOf = (id: number) => players.find((p) => p.id === id)?.name ?? `player #${id}`;
  return {
    ownerName: nameOf(replacement.fulltimePlayerId),
    replacementName: nameOf(replacement.replacementPlayerId),
  };
}

export function notifyAdminsOfJoinRequest(request: SquadJoinRequest): Promise<void> {
  const what = `join request #${request.id}`;
  return neverThrow(what, () =>
    sendAdminPost(request.squadId, what, (ctx) =>
      buildJoinRequestMessage(ctx, { name: request.name, email: request.email, message: request.message })
    )
  );
}

export function notifyAdminsOfReplacement(replacement: SlotReplacement): Promise<void> {
  const what = `new replacement #${replacement.id}`;
  return neverThrow(what, async () => {
    const names = await loadReplacementNames(replacement);
    await sendAdminPost(replacement.squadId, what, (ctx) =>
      buildReplacementCreatedMessage(ctx, { ...names, startDate: replacement.startDate, endDate: replacement.endDate })
    );
  });
}

// Called with the row the request wrote. A row with no pending request is the idempotent
// "already cancelled" return of requestCancelReplacementCancellation - nothing new to decide.
export function notifyAdminsOfCancellationRequest(replacement: SlotReplacement): Promise<void> {
  if (!replacement.cancellationRequestedAt) return Promise.resolve();
  const what = `cancellation request on replacement #${replacement.id}`;
  return neverThrow(what, async () => {
    const names = await loadReplacementNames(replacement);
    await sendAdminPost(replacement.squadId, what, (ctx) =>
      buildCancellationRequestMessage(ctx, {
        ...names,
        startDate: replacement.startDate,
        endDate: replacement.endDate,
        requestedEndDate: replacement.cancellationRequestedEndDate,
      })
    );
  });
}
