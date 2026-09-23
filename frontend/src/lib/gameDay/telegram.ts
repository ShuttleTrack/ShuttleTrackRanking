// Sends a game-day post to one of the squad's two groups. The bot token is the one shared
// TELEGRAM_BOT_TOKEN (one real bot, as today); only the chat ids are per-squad, from gameDayOps.
// Absolute links use the existing NEXT_PUBLIC_APP_URL.
import type { GameDay, Squad } from '@prisma/client';
import { parseGameDayOps } from '@/lib/gameDayOps';
import { sendTelegramMessage } from '@/lib/telegram/sendMessage';
import { isoFromDateOnly } from './clock';
import type { MessageContext, TelegramPost } from './notifications';

export type GameDayGroup = 'main' | 'openSlot';

export type SendOutcome =
  | { status: 'sent' }
  | { status: 'skipped'; reason: string } // deliberately not sent - never retried
  | { status: 'failed'; reason: string }; // should have gone out - the caller leaves its stamp unset

export function messageContextFor(gameDay: GameDay, squad: Pick<Squad, 'name' | 'slug'>): MessageContext {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    squadName: squad.name,
    slug: squad.slug,
    gameDate: isoFromDateOnly(gameDay.gameDate),
    startTime: gameDay.startTime,
    endTime: gameDay.endTime,
  };
}

export function chatIdFor(squad: Pick<Squad, 'gameDayOps'>, group: GameDayGroup): string | null {
  const ops = parseGameDayOps(squad.gameDayOps);
  if (!ops) return null;
  return group === 'main' ? ops.telegramMainChatId : ops.telegramOpenSlotChatId;
}

export async function sendGameDayPost(
  squad: Pick<Squad, 'gameDayOps' | 'slug'>,
  group: GameDayGroup,
  message: TelegramPost
): Promise<SendOutcome> {
  const chatId = chatIdFor(squad, group);
  if (!chatId) {
    return { status: 'skipped', reason: `no ${group === 'main' ? 'main' : 'open-slot'} group chat id configured` };
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { status: 'failed', reason: 'TELEGRAM_BOT_TOKEN is not set' };
  }
  try {
    const result = await sendTelegramMessage(botToken, chatId, message.text, message.buttons);
    return result.ok ? { status: 'sent' } : { status: 'failed', reason: result.description ?? 'unknown error' };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

export function logSend(squad: Pick<Squad, 'slug'>, what: string, outcome: SendOutcome): void {
  if (outcome.status === 'sent') {
    console.log(`[game-day] ${squad.slug}: sent ${what}`);
  } else if (outcome.status === 'skipped') {
    console.log(`[game-day] ${squad.slug}: skipped ${what} (${outcome.reason})`);
  } else {
    console.error(`[game-day] ${squad.slug}: failed to send ${what}: ${outcome.reason}`);
  }
}
