// Game-day check-in operations config (ATTENDANCE_VOTE_PLAN.md, Decision 9), stored as one JSON
// blob on Squad.gameDayOps exactly like Squad.schedule - nothing ever queries or filters by an
// individual piece. The database does not type-check a JSON column, so validation lives here:
// validateGameDayOpsInput is the only writer (mirroring lib/squadSchedule.ts's
// validateScheduleInput, down to its returns-data-or-error shape), and parseGameDayOps is the
// only reader.

export const DEFAULT_VOTE_OPENS_DAYS_BEFORE = 2;
// Bounded for the same reason MAX_REPLACEMENT_MONTHS is: the scheduler walks every date from
// today through today + this, once per squad per tick.
export const MAX_VOTE_OPENS_DAYS_BEFORE = 14;
// A session needs at least one group of 4, and the planner caps a game day at 20 players.
export const MIN_PLAYERS_FOR_OPEN_SLOT_RANGE = { min: 4, max: 20 } as const;

// A numeric chat id (groups and supergroups are negative, e.g. -1001234567890) or a public
// @channelusername - the two forms the Bot API's chat_id accepts.
const CHAT_ID_FORMAT = /^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/;

export interface GameDayOpsInput {
  enabled?: unknown;
  voteOpensDaysBefore?: unknown;
  minPlayersForOpenSlot?: unknown;
  telegramMainChatId?: unknown;
  telegramOpenSlotChatId?: unknown;
}

// Exactly what is stored in Squad.gameDayOps.
export interface GameDayOpsData {
  enabled: boolean; // false clears the rest, like schedule.isRecurring
  voteOpensDaysBefore: number;
  minPlayersForOpenSlot: number | null; // null = no open-slot flow on this squad
  telegramMainChatId: string | null;
  telegramOpenSlotChatId: string | null;
}

const DISABLED: GameDayOpsData = {
  enabled: false,
  voteOpensDaysBefore: DEFAULT_VOTE_OPENS_DAYS_BEFORE,
  minPlayersForOpenSlot: null,
  telegramMainChatId: null,
  telegramOpenSlotChatId: null,
};

// Trimmed chat id, null for none (absent or blank), or undefined when it is not a valid chat id.
// Also validates Squad.adminTelegramChatId (pages/api/squads/[squadId]/admin-telegram.ts).
export function normaliseChatId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return CHAT_ID_FORMAT.test(trimmed) ? trimmed : undefined;
}

export function validateGameDayOpsInput(input: GameDayOpsInput): { data: GameDayOpsData } | { error: string } {
  if (input.enabled !== true) {
    return { data: { ...DISABLED } };
  }

  const voteOpensDaysBefore = input.voteOpensDaysBefore ?? DEFAULT_VOTE_OPENS_DAYS_BEFORE;
  if (
    typeof voteOpensDaysBefore !== 'number' ||
    !Number.isInteger(voteOpensDaysBefore) ||
    voteOpensDaysBefore < 1 ||
    voteOpensDaysBefore > MAX_VOTE_OPENS_DAYS_BEFORE
  ) {
    return { error: `The vote must open between 1 and ${MAX_VOTE_OPENS_DAYS_BEFORE} days before the game day` };
  }

  const minPlayersForOpenSlot = input.minPlayersForOpenSlot ?? null;
  if (
    minPlayersForOpenSlot !== null &&
    (typeof minPlayersForOpenSlot !== 'number' ||
      !Number.isInteger(minPlayersForOpenSlot) ||
      minPlayersForOpenSlot < MIN_PLAYERS_FOR_OPEN_SLOT_RANGE.min ||
      minPlayersForOpenSlot > MIN_PLAYERS_FOR_OPEN_SLOT_RANGE.max)
  ) {
    return {
      error: `The open-slot minimum must be a whole number between ${MIN_PLAYERS_FOR_OPEN_SLOT_RANGE.min} and ${MIN_PLAYERS_FOR_OPEN_SLOT_RANGE.max}, or empty to turn the open-slot flow off`,
    };
  }

  const telegramMainChatId = normaliseChatId(input.telegramMainChatId);
  if (telegramMainChatId === undefined) {
    return { error: 'The main group chat id must be a numeric Telegram chat id (e.g. -1001234567890) or an @channel name' };
  }
  const telegramOpenSlotChatId = normaliseChatId(input.telegramOpenSlotChatId);
  if (telegramOpenSlotChatId === undefined) {
    return { error: 'The open-slot group chat id must be a numeric Telegram chat id (e.g. -1001234567890) or an @channel name' };
  }
  // The open-slot group is only ever messaged by the open-slot flow, which does not exist
  // without a minimum - a chat id here would be configuration that silently does nothing.
  if (telegramOpenSlotChatId !== null && minPlayersForOpenSlot === null) {
    return {
      error: 'An open-slot group chat id needs a minimum player count - without one there is no open-slot flow to announce',
    };
  }

  return {
    data: {
      enabled: true,
      voteOpensDaysBefore,
      minPlayersForOpenSlot,
      telegramMainChatId,
      telegramOpenSlotChatId,
    },
  };
}

// Tolerant reader for the stored blob: anything that does not validate reads as "never
// configured" rather than throwing, so one squad's malformed row cannot abort the scheduler's
// sweep for every other squad.
export function parseGameDayOps(raw: unknown): GameDayOpsData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const result = validateGameDayOpsInput(raw as GameDayOpsInput);
  if ('error' in result || !result.data.enabled) return null;
  return result.data;
}

// The flat wire names GET /api/squads/[squadId] unpacks the blob into, the same way it unpacks
// `schedule` into scheduleXxx - so useSquadSettings keeps its flat shape.
export interface GameDayOpsWire {
  gameDayOpsEnabled: boolean;
  gameDayVoteOpensDaysBefore: number;
  gameDayMinPlayersForOpenSlot: number | null;
  gameDayTelegramMainChatId: string | null;
  gameDayTelegramOpenSlotChatId: string | null;
}

export function gameDayOpsToWire(raw: unknown): GameDayOpsWire {
  const ops = parseGameDayOps(raw) ?? DISABLED;
  return {
    gameDayOpsEnabled: ops.enabled,
    gameDayVoteOpensDaysBefore: ops.voteOpensDaysBefore,
    gameDayMinPlayersForOpenSlot: ops.minPlayersForOpenSlot,
    gameDayTelegramMainChatId: ops.telegramMainChatId,
    gameDayTelegramOpenSlotChatId: ops.telegramOpenSlotChatId,
  };
}
