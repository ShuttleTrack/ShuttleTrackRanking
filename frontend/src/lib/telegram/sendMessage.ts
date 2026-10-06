// Plain-fetch Telegram Bot API sendMessage, used by the game-day check-in (ATTENDANCE_VOTE_PLAN.md)
// and the score keeper's game notifications (pages/api/squads/[squadId]/notify.ts), both sending
// to per-squad chat ids. The chat id is always an argument - nothing here reads env for a
// destination. Plain fetch rather than a Telegram client library, to keep the dependency surface
// small.
//
// Sending is opt-in per process: only a server with TELEGRAM_SEND_ENABLED=true talks to Telegram.
// The chat ids live in the database, so any server running on a copy of live data - a dev
// server, a temporary stack - would otherwise post to the real groups the moment it has a bot
// token, and the game-day send-once guard cannot help: it dedupes within one database only.
// Everywhere else the message is logged instead.

export interface TelegramButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboard {
  inline_keyboard: TelegramButton[][];
}

export interface SendMessageResult {
  ok: boolean;
  // Deliberately not sent (sending disabled in this process) - callers treat it as done, never
  // as a failure to retry.
  skipped?: boolean;
  description?: string;
}

// Long enough for a slow Bot API reply; short enough that one hung request cannot hold the
// game-day tick (and every tick queued behind its in-progress guard) for minutes.
const SEND_TIMEOUT_MS = 10_000;

export function isTelegramSendEnabled(): boolean {
  return process.env.TELEGRAM_SEND_ENABLED === 'true';
}

export async function sendTelegramMessage(
  botToken: string | undefined,
  chatId: string,
  text: string,
  buttons?: InlineKeyboard
): Promise<SendMessageResult> {
  if (!isTelegramSendEnabled()) {
    const buttonLines = (buttons?.inline_keyboard ?? []).flat().map((b) => `  [${b.text}] ${b.url ?? b.callback_data ?? ''}`);
    console.log(
      [`[telegram] Sending disabled (TELEGRAM_SEND_ENABLED is not 'true'); would have sent to ${chatId}:`, text, ...buttonLines].join('\n')
    );
    return { ok: false, skipped: true, description: "sending disabled (TELEGRAM_SEND_ENABLED is not 'true')" };
  }
  if (!botToken) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not set' };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...(buttons ? { reply_markup: buttons } : {}),
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    return { ok: false, description: body.description ?? response.statusText };
  }
  return { ok: true };
}

// Telegram's HTML parse mode rejects a message with a stray '<' or '&', so anything
// user-supplied (a player or squad name) is escaped before it is interpolated.
export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
