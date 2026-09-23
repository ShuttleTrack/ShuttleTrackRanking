import { describe, it, expect } from 'vitest';
import { addCalendarDays, addMinutes, instantAt, isValidTimeZone, localDateIso, wallClockIn } from './clock';
import { resolveGameDayInstants, sessionPhase, sessionStatusLabel } from './voteWindow';

const AMS = 'Europe/Amsterdam';

// 2026: Europe springs forward on Sun 29 March (02:00 -> 03:00) and falls back on Sun 25 October
// (03:00 -> 02:00); New York moves on 8 March and 1 November.
describe('instantAt', () => {
  it('resolves 13:00 Amsterdam on either side of the spring-forward transition', () => {
    expect(instantAt('2026-03-28', '13:00', AMS).toISOString()).toBe('2026-03-28T12:00:00.000Z'); // CET, +1
    expect(instantAt('2026-03-29', '13:00', AMS).toISOString()).toBe('2026-03-29T11:00:00.000Z'); // CEST, +2
  });

  it('resolves 13:00 Amsterdam on either side of the fall-back transition', () => {
    expect(instantAt('2026-10-24', '13:00', AMS).toISOString()).toBe('2026-10-24T11:00:00.000Z');
    expect(instantAt('2026-10-25', '13:00', AMS).toISOString()).toBe('2026-10-25T12:00:00.000Z');
  });

  it('lands 09:00 / 10:00 / 13:00 on the right instants on the transition days themselves', () => {
    expect(instantAt('2026-03-29', '09:00', AMS).toISOString()).toBe('2026-03-29T07:00:00.000Z');
    expect(instantAt('2026-03-29', '10:00', AMS).toISOString()).toBe('2026-03-29T08:00:00.000Z');
    expect(instantAt('2026-10-25', '09:00', AMS).toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(instantAt('2026-10-25', '10:00', AMS).toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });

  it('handles a zone with a different offset and different transition dates', () => {
    const NY = 'America/New_York';
    expect(instantAt('2026-03-07', '09:00', NY).toISOString()).toBe('2026-03-07T14:00:00.000Z'); // EST, -5
    expect(instantAt('2026-03-08', '09:00', NY).toISOString()).toBe('2026-03-08T13:00:00.000Z'); // EDT, -4
    expect(instantAt('2026-09-23', '13:00', 'Asia/Colombo').toISOString()).toBe('2026-09-23T07:30:00.000Z'); // +05:30
  });

  it('round-trips against wallClockIn for every hour across both Amsterdam transitions', () => {
    for (const date of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) {
      for (let h = 0; h < 24; h++) {
        // 02:xx on the spring-forward day does not exist in Amsterdam.
        if (date === '2026-03-29' && h === 2) continue;
        const time = `${String(h).padStart(2, '0')}:15`;
        const clock = wallClockIn(instantAt(date, time, AMS), AMS);
        expect(`${clock.year}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')} ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`).toBe(`${date} ${time}`);
      }
    }
  });
});

describe('wall-clock helpers', () => {
  it("the squad's date is its own wall-clock date, not UTC's", () => {
    // 22:30Z on the 22nd is 00:30 on the 23rd in Amsterdam (CEST).
    expect(localDateIso(new Date('2026-09-22T22:30:00Z'), AMS)).toBe('2026-09-23');
    expect(new Date('2026-09-22T22:30:00Z').toISOString().slice(0, 10)).toBe('2026-09-22');
  });

  it('never renders midnight as hour 24', () => {
    expect(wallClockIn(new Date('2026-09-22T22:00:00Z'), AMS).hour).toBe(0);
  });

  it('steps calendar days across month ends and DST boundaries', () => {
    expect(addCalendarDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addCalendarDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('validates IANA zones', () => {
    expect(isValidTimeZone('Europe/Amsterdam')).toBe(true);
    expect(isValidTimeZone('Nowhere/Special')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it('adds minutes to an instant', () => {
    expect(addMinutes(new Date('2026-09-23T17:00:00Z'), -120).toISOString()).toBe('2026-09-23T15:00:00.000Z');
  });
});

describe('game day instants and phase', () => {
  const clock = { gameDate: '2026-09-23', startTime: '19:00', endTime: '22:00', timezone: AMS };

  it('resolves the deadline, the slot lock (start - 2h) and the ping/reminder times', () => {
    const i = resolveGameDayInstants(clock);
    expect(i.votesCloseAt.toISOString()).toBe('2026-09-23T11:00:00.000Z');
    expect(i.slotLockAt.toISOString()).toBe('2026-09-23T15:00:00.000Z');
    expect(i.openSlotPingAt.toISOString()).toBe('2026-09-23T07:00:00.000Z');
    expect(i.reminderAt.toISOString()).toBe('2026-09-23T08:00:00.000Z');
  });

  it('derives upcoming / live / ended from the clock alone', () => {
    expect(sessionPhase(clock, new Date('2026-09-23T16:59:00Z'))).toBe('upcoming');
    expect(sessionPhase(clock, new Date('2026-09-23T17:00:00Z'))).toBe('live');
    expect(sessionPhase(clock, new Date('2026-09-23T20:00:00Z'))).toBe('ended');
  });

  it('counts down in real elapsed time', () => {
    expect(sessionStatusLabel(clock, new Date('2026-09-21T15:00:00Z'))).toBe('Starts in 2d 2h');
    expect(sessionStatusLabel(clock, new Date('2026-09-23T16:15:00Z'))).toBe('Starts in 45m');
    expect(sessionStatusLabel(clock, new Date('2026-09-23T18:00:00Z'))).toBe('Live now');
  });
});
