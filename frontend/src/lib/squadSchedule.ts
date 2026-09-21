// Informational-only recurrence schedule for a squad (SQUAD_TENANCY_PLAN.md follow-up), stored
// as a single JSON blob on Squad.schedule rather than separate columns - nothing ever
// queries/filters by day-of-week, start time, or any other individual piece, so separate columns
// bought nothing but column count. Validation lives here so both the API route and (if ever
// needed) a script/test can share it.

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

const TIME_FORMAT = /^([01]\d|2[0-3]):([0-5]\d)$/; // "HH:mm", 24h
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/; // "YYYY-MM-DD"

export interface ScheduleInput {
  isRecurring: boolean;
  dayOfWeek?: DayOfWeek | null;
  startTime?: string | null;
  endTime?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  skipDates?: string[];
}

// Exactly what's stored in Squad.schedule (and returned by GET /api/squads/[squadId], unpacked
// into the flatter scheduleXxx field names the frontend already used before this collapsed to
// one JSON column - see that route).
export interface SquadScheduleData {
  isRecurring: boolean;
  dayOfWeek: DayOfWeek | null;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  skipDates: string[];
}

const DAYS_OF_WEEK: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

// Returns the cleaned data to persist, or a validation error message. Switching isRecurring off
// clears every other schedule field, so a squad can't be left with stale recurrence data that
// doesn't match its own flag.
export function validateScheduleInput(input: ScheduleInput): { data: SquadScheduleData } | { error: string } {
  if (!input.isRecurring) {
    return {
      data: {
        isRecurring: false,
        dayOfWeek: null,
        startTime: null,
        endTime: null,
        startDate: null,
        endDate: null,
        skipDates: [],
      },
    };
  }

  if (!input.dayOfWeek || !DAYS_OF_WEEK.includes(input.dayOfWeek)) {
    return { error: 'A day of week is required for a recurring squad' };
  }
  if (!input.startTime || !TIME_FORMAT.test(input.startTime)) {
    return { error: 'Start time must be in HH:mm (24h) format' };
  }
  if (!input.endTime || !TIME_FORMAT.test(input.endTime)) {
    return { error: 'End time must be in HH:mm (24h) format' };
  }
  if (input.endTime <= input.startTime) {
    return { error: 'End time must be after start time' };
  }
  if (!input.startDate || !DATE_FORMAT.test(input.startDate)) {
    return { error: 'A start date is required for a recurring squad' };
  }
  if (input.endDate && !DATE_FORMAT.test(input.endDate)) {
    return { error: 'End date must be in YYYY-MM-DD format' };
  }
  if (input.endDate && input.endDate < input.startDate) {
    return { error: 'End date must be on or after the start date' };
  }

  const skipDates = input.skipDates ?? [];
  for (const d of skipDates) {
    if (!DATE_FORMAT.test(d)) {
      return { error: `Invalid skip date: "${d}" (expected YYYY-MM-DD)` };
    }
  }

  return {
    data: {
      isRecurring: true,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      skipDates,
    },
  };
}
