// Ported from backend EncounterScheduler.sendEncounterPoll (MIGRATION_PLAN.md Phase 6). Uses
// the Telegram Bot API's sendPoll method via plain fetch, matching the existing pattern in
// pages/api/notify.ts - not a Node Telegram client library (the Java side used one, but there's
// no reason to pull in an extra dependency here for a single API call).

export interface SendPollResult {
  ok: boolean;
  description?: string;
}

function formatDateLikeJavaLocalDate(date: Date): string {
  // java.time.LocalDate's default toString() (used in the poll question) is ISO-8601 yyyy-MM-dd.
  return date.toISOString().slice(0, 10);
}

export async function sendEncounterPoll(botToken: string, chatId: string, matchDate: Date): Promise<SendPollResult> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPoll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      question: `Joining Badminton on ${formatDateLikeJavaLocalDate(matchDate)}`,
      options: ['In', 'In (from overflow)', 'Out', 'Out (slot passed to someone else)'],
      allows_multiple_answers: false,
      is_anonymous: false,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    return { ok: false, description: body.description ?? response.statusText };
  }
  return { ok: true };
}
