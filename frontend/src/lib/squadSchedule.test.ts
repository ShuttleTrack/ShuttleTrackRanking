import { describe, it, expect } from 'vitest';
import { validateScheduleInput } from './squadSchedule';

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
        scheduleDayOfWeek: null,
        scheduleStartTime: null,
        scheduleEndTime: null,
        scheduleStartDate: null,
        scheduleEndDate: null,
        scheduleSkipDates: [],
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
      expect(result.data.scheduleDayOfWeek).toBe('WEDNESDAY');
      expect(result.data.scheduleStartTime).toBe('18:00');
      expect(result.data.scheduleEndDate).toBeNull();
      expect(result.data.scheduleSkipDates).toEqual(['2026-12-25']);
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
});
