import { dayNameOf, nextOccurrenceOf } from './nextOccurrence';
import { TELEGRAM_SCHEDULE, resolveChatId } from './scheduleConfig';
import { sendEncounterPoll } from './sendEncounterPoll';

// Ported from backend EncounterScheduler.scheduleEncounter (MIGRATION_PLAN.md Phase 6).

export interface PollDecision {
  send: boolean;
  chatId?: string;
  matchDate?: Date;
  reason?: string; // only set when send=false, for logging
}

// Pure: given "today", decide whether a poll should go out and for which date - no network/env
// access, so this is unit-testable without mocking fetch or process.env.
export function decidePollForDate(today: Date, chatId: string | undefined): PollDecision {
  const schedule = TELEGRAM_SCHEDULE[dayNameOf(today)];
  if (!schedule) {
    return { send: false, reason: `No group configured for ${dayNameOf(today)}` };
  }
  if (!chatId) {
    return { send: false, reason: `No chat id configured for ${dayNameOf(today)} (missing env var)` };
  }
  return { send: true, chatId, matchDate: nextOccurrenceOf(schedule.matchDay, today) };
}

// Impure entry point - reads env vars and actually sends the poll. This is what the cron
// trigger (instrumentation.ts) calls.
export async function runDailyEncounterPollCheck(now: Date = new Date()): Promise<void> {
  const schedule = TELEGRAM_SCHEDULE[dayNameOf(now)];
  const chatId = schedule ? resolveChatId(schedule) : undefined;
  const decision = decidePollForDate(now, chatId);

  if (!decision.send) {
    console.log(`[telegram-scheduler] ${decision.reason}`);
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[telegram-scheduler] TELEGRAM_BOT_TOKEN is not set, cannot send poll');
    return;
  }

  const result = await sendEncounterPoll(botToken, decision.chatId!, decision.matchDate!);
  if (result.ok) {
    console.log(
      `[telegram-scheduler] Sent poll to chat ${decision.chatId} for match on ${decision.matchDate!.toISOString().slice(0, 10)}`
    );
  } else {
    console.error(`[telegram-scheduler] Failed to send poll to chat ${decision.chatId}: ${result.description}`);
  }
}
