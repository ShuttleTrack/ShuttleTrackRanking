// Message bodies for the score keeper's Telegram posts (a game started / completed / cancelled).
// Built on the server from the squad and game id alone - the client only names the event - so
// the links always point at this squad's pages and nothing posted can be steered by a request
// body. Sent to the squad's main group (gameDayOps.telegramMainChatId) via sendGameDayPost, and
// for a public squad's start/completion also to its open-slot group - see gameEventGroups.
import { buttonsFor, type TelegramPost } from '@/lib/gameDay/notifications';
import type { GameDayGroup } from '@/lib/gameDay/telegram';
import { escapeTelegramHtml } from '@/lib/telegram/sendMessage';

export const GAME_EVENTS = ['started', 'completed', 'cancelled'] as const;
export type GameEvent = (typeof GAME_EVENTS)[number];

export function isGameEvent(value: unknown): value is GameEvent {
  return typeof value === 'string' && (GAME_EVENTS as readonly string[]).includes(value);
}

// The groups a game event is posted to. Always the main group; a public squad's start and
// completion also go to the open-slot group, so the people queueing for spare spots can follow
// the games. Cancellations stay main-only. When both groups are the same chat it is posted once.
export function gameEventGroups(
  event: GameEvent,
  squad: { isPublic: boolean },
  chatIds: { main: string | null; openSlot: string | null }
): GameDayGroup[] {
  const groups: GameDayGroup[] = ['main'];
  if (squad.isPublic && event !== 'cancelled' && chatIds.openSlot && chatIds.openSlot !== chatIds.main) {
    groups.push('openSlot');
  }
  return groups;
}

export interface GameMessageContext {
  appUrl: string; // NEXT_PUBLIC_APP_URL
  squadName: string;
  slug: string;
  gameId: string;
}

function squadUrl(ctx: GameMessageContext, path = ''): string {
  return `${ctx.appUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(ctx.slug)}${path}`;
}

export function gameViewerUrl(ctx: GameMessageContext): string {
  return squadUrl(ctx, `/game-viewer?gameId=${encodeURIComponent(ctx.gameId)}`);
}

export function rankingsUrl(ctx: GameMessageContext): string {
  return squadUrl(ctx);
}

function shortId(gameId: string): string {
  return escapeTelegramHtml(gameId.slice(-4));
}

function withLink(lines: string[], url: string, buttonLabel: string): TelegramPost {
  const buttons = buttonsFor(url, buttonLabel);
  const text = buttons ? lines.join('\n') : [...lines, '', url].join('\n');
  return { text, buttons };
}

export function buildGameMessage(event: GameEvent, ctx: GameMessageContext): TelegramPost {
  const squad = escapeTelegramHtml(ctx.squadName);
  const game = `Game #${shortId(ctx.gameId)}`;

  switch (event) {
    case 'started':
      return withLink(
        [`🏸 <b>${squad} — ${game} has started!</b>`, 'Track live scores and game combinations.'],
        gameViewerUrl(ctx),
        '📊 Track Scores'
      );
    case 'completed':
      return withLink([`🏆 <b>${squad} — ${game} has been completed!</b>`], rankingsUrl(ctx), '🏆 Check Rankings');
    case 'cancelled':
      return { text: `❌ <b>${squad} — ${game} has been cancelled.</b>` };
  }
}
