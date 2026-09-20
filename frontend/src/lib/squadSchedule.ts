import type { DayOfWeek } from '@prisma/client';

// Informational-only recurrence schedule for a squad (SQUAD_TENANCY_PLAN.md follow-up) - see
// the Squad model in schema.prisma for what each field means. Validation lives here so both the
// API route and (if ever needed) a script/test can share it.

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

export interface ValidatedSchedule {
  isRecurring: boolean;
  scheduleDayOfWeek: DayOfWeek | null;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  scheduleStartDate: Date | null;
  scheduleEndDate: Date | null;
  // Never a Prisma-level null (Json? columns need the special Prisma.JsonNull sentinel for
  // that, which isn't worth the awkwardness here) - an empty array means "no skip dates".
  scheduleSkipDates: string[];
}

const DAYS_OF_WEEK: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

// Returns the cleaned data to persist, or a validation error message. Switching isRecurring off
// clears every other schedule field, so a squad can't be left with stale recurrence data that
// doesn't match its own flag.
export function validateScheduleInput(input: ScheduleInput): { data: ValidatedSchedule } | { error: string } {
  if (!input.isRecurring) {
    return {
      data: {
        isRecurring: false,
        scheduleDayOfWeek: null,
        scheduleStartTime: null,
        scheduleEndTime: null,
        scheduleStartDate: null,
        scheduleEndDate: null,
        scheduleSkipDates: [],
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
      scheduleDayOfWeek: input.dayOfWeek,
      scheduleStartTime: input.startTime,
      scheduleEndTime: input.endTime,
      scheduleStartDate: new Date(`${input.startDate}T00:00:00Z`),
      scheduleEndDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
      scheduleSkipDates: skipDates,
    },
  };
}
