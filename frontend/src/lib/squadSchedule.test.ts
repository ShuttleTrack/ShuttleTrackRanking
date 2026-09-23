import { describe, it, expect } from 'vitest';
import { scheduleTimezone, validateScheduleInput } from './squadSchedule';

describe('validateScheduleInput', () => {
  it('one-off (isRecurring false) clears every schedule field regardless of what else is sent', () => {
    const result = validateScheduleInput({
      isRecurring: false,
      dayOfWeek: 'WEDNESDAY',
      startTime: '18:00',
      endTime: '20:00',
      startDate: '2026-01-01',
      skipDates: ['2026-12-25'],
    });
    expect(result).toEqual({
      data: {
        isRecurring: false,
        dayOfWeek: null,
        startTime: null,
        endTime: null,
        startDate: null,
        endDate: null,
        skipDates: [],
        timezone: null,
      },
    });
  });

  it('valid recurring input parses cleanly, end date optional', () => {
    const result = validateScheduleInput({
      isRecurring: true,
      dayOfWeek: 'WEDNESDAY',
      startTime: '18:00',
      endTime: '20:00',
      startDate: '2026-01-01',
      skipDates: ['2026-12-25'],
    });
    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.isRecurring).toBe(true);
      expect(result.data.dayOfWeek).toBe('WEDNESDAY');
      expect(result.data.startTime).toBe('18:00');
      expect(result.data.startDate).toBe('2026-01-01');
      expect(result.data.endDate).toBeNull();
      expect(result.data.skipDates).toEqual(['2026-12-25']);
    }
  });

  it('rejects a missing day of week when recurring', () => {
    const result = validateScheduleInput({
      isRecurring: true,
      startTime: '18:00',
      endTime: '20:00',
      startDate: '2026-01-01',
    });
    expect(result).toEqual({ error: 'A day of week is required for a recurring squad' });
  });

  it('rejects a malformed time', () => {
    const result = validateScheduleInput({
      isRecurring: true,
      dayOfWeek: 'WEDNESDAY',
      startTime: '6pm',
      endTime: '20:00',
      startDate: '2026-01-01',
    });
    expect(result).toEqual({ error: 'Start time must be in HH:mm (24h) format' });
  });

  it('rejects end time not after start time', () => {
    const result = validateScheduleInput({
      isRecurring: true,
      dayOfWeek: 'WEDNESDAY',
      startTime: '20:00',
      endTime: '18:00',
      startDate: '2026-01-01',
    });
    expect(result).toEqual({ error: 'End time must be after start time' });
  });

  it('rejects an end date before the start date', () => {
    const result = validateScheduleInput({
      isRecurring: true,
      dayOfWeek: 'WEDNESDAY',
      startTime: '18:00',
      endTime: '20:00',
      startDate: '2026-06-01',
      endDate: '2026-01-01',
    });
    expect(result).toEqual({ error: 'End date must be on or after the start date' });
  });

  it('rejects a malformed skip date', () => {
    const result = validateScheduleInput({
      isRecurring: true,
      dayOfWeek: 'WEDNESDAY',
      startTime: '18:00',
      endTime: '20:00',
      startDate: '2026-01-01',
      skipDates: ['25 Dec 2026'],
    });
    expect(result).toEqual({ error: 'Invalid skip date: "25 Dec 2026" (expected YYYY-MM-DD)' });
  });

  it('defaults the timezone to Europe/Amsterdam and keeps a valid one', () => {
    const base = {
      isRecurring: true,
      dayOfWeek: 'WEDNESDAY' as const,
      startTime: '18:00',
      endTime: '20:00',
      startDate: '2026-01-01',
    };
    const defaulted = validateScheduleInput(base);
    expect('data' in defaulted && defaulted.data.timezone).toBe('Europe/Amsterdam');
    const london = validateScheduleInput({ ...base, timezone: 'Europe/London' });
    expect('data' in london && london.data.timezone).toBe('Europe/London');
  });

  it('rejects an unknown timezone', () => {
    const result = validateScheduleInput({
      isRecurring: true,
      dayOfWeek: 'WEDNESDAY',
      startTime: '18:00',
      endTime: '20:00',
      startDate: '2026-01-01',
      timezone: 'Mars/Olympus_Mons',
    });
    expect('error' in result && result.error).toContain('Unknown timezone');
  });
});

describe('scheduleTimezone', () => {
  it('falls back to Europe/Amsterdam for a row written before the field existed', () => {
    expect(scheduleTimezone(null)).toBe('Europe/Amsterdam');
    expect(scheduleTimezone({})).toBe('Europe/Amsterdam');
    expect(scheduleTimezone({ timezone: 'Asia/Colombo' })).toBe('Asia/Colombo');
  });
});
