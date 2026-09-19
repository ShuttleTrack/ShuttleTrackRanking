import type { DayName } from './nextOccurrence';

// Ported from backend configuration/TelegramGroupConfig.java + application.yaml's api.tg.groups
// (MIGRATION_PLAN.md Phase 6, §3's consolidation decision). The real backend has a separate
// bot token per day-config entry, but §3 confirmed both days actually use the *same* bot
// (redundant duplication, not two real bots) - so this is one shared TELEGRAM_BOT_TOKEN (already
// used by pages/api/notify.ts) plus a day-keyed map of { matchDay, chat id }.

export interface DaySchedule {
  matchDay: DayName;
  // Name of the env var holding this day's Telegram chat/group id, not the value itself - kept
  // as an indirection so scheduleConfig.ts stays a plain data module (see resolveChatId).
  chatIdEnvVar: string;
}

// Matches the real currently-configured values (application.yaml): Monday's poll asks about the
// upcoming Wednesday match, Wednesday's poll asks about the upcoming Friday match. The existing
// TELEGRAM_CHAT_ID is Monday's group (confirmed - it's already the group notify.ts sends to
// today); Wednesday's needs a new env var (TELEGRAM_CHAT_ID_WEDNESDAY) since the frontend never
// had backend's second group id - see .env.example.
export const TELEGRAM_SCHEDULE: Partial<Record<DayName, DaySchedule>> = {
  MONDAY: { matchDay: 'WEDNESDAY', chatIdEnvVar: 'TELEGRAM_CHAT_ID' },
  WEDNESDAY: { matchDay: 'FRIDAY', chatIdEnvVar: 'TELEGRAM_CHAT_ID_WEDNESDAY' },
};

export function resolveChatId(schedule: DaySchedule): string | undefined {
  return process.env[schedule.chatIdEnvVar];
}
