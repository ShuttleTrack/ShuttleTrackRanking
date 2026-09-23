// Plain-fetch Telegram Bot API sendMessage, extracted from pages/api/notify.ts so the game-day
// check-in (ATTENDANCE_VOTE_PLAN.md) can send to per-squad chat ids. The chat id is always an
// argument - nothing here reads env for a destination. Same no-client-library reasoning as
// sendEncounterPoll.ts.

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
  description?: string;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  buttons?: InlineKeyboard
): Promise<SendMessageResult> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...(buttons ? { reply_markup: buttons } : {}),
    }),
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
