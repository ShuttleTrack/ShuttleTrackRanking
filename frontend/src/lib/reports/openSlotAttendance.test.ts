import { describe, expect, it } from 'vitest';
import {
  classifyOpenSlotAttendance,
  subtractCalendarMonths,
  type AttendanceGameDay,
  type AttendanceInput,
  type OpenSlotAttendanceDay,
} from './openSlotAttendance';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const gameDay = (date: string, overrides: Partial<AttendanceGameDay> = {}): AttendanceGameDay => ({
  gameDate: d(date),
  votes: [],
  openSlots: [],
  nominations: [],
  ...overrides,
});

// 1-4 full-time; 5 Eve, 6 Dan, 7 Cat open-slot.
const baseInput = (overrides: Partial<AttendanceInput>): AttendanceInput => ({
  openSlotPlayers: new Map([
    [5, 'Eve'],
    [6, 'Dan'],
    [7, 'Cat'],
  ]),
  playerNames: new Map([
    [1, 'Alice'],
    [2, 'Bob'],
    [5, 'Eve'],
    [6, 'Dan'],
    [7, 'Cat'],
  ]),
  gameDays: [],
  encounters: [],
  replacements: [],
  today: '2026-10-03',
  ...overrides,
});

const lists = (day: OpenSlotAttendanceDay) => ({
  registeredAndPlayed: day.registeredAndPlayed.map((p) => p.name),
  registeredNotPlayed: day.registeredNotPlayed.map((p) => p.name),
  playedNotRegistered: day.playedNotRegistered.map((p) => p.name),
});

describe('subtractCalendarMonths', () => {
  it('steps back calendar months', () => {
    expect(subtractCalendarMonths('2026-10-03', 2)).toBe('2026-08-03');
    expect(subtractCalendarMonths('2026-01-15', 2)).toBe('2025-11-15');
  });
});

describe('classifyOpenSlotAttendance', () => {
  it('splits a day into the three lists', () => {
    const [day] = classifyOpenSlotAttendance(
      baseInput({
        gameDays: [
          gameDay('2026-09-01', {
            votes: [
              { playerId: 5, choice: 'IN', inheritedFromPlayerId: null },
              { playerId: 6, choice: 'IN', inheritedFromPlayerId: null },
            ],
            openSlots: [
              { playerId: 5, status: 'ASSIGNED' },
              { playerId: 6, status: 'ASSIGNED' },
              { playerId: 7, status: 'WAITING' },
            ],
          }),
        ],
        encounters: [
          { encounterDate: d('2026-09-01'), team1: '1:5', team2: '2:7' },
          { encounterDate: d('2026-09-01'), team1: '1:2', team2: '5:7' },
        ],
      })
    );
    expect(day.date).toBe('2026-09-01');
    // The waiting list alone is not registration.
    expect(lists(day)).toEqual({
      registeredAndPlayed: ['Eve'],
      registeredNotPlayed: ['Dan'],
      playedNotRegistered: ['Cat'],
    });
    expect(day.registeredAndPlayed[0].matches).toBe(2);
  });

  it('lists days newest first, keeping a day with no open-slot players', () => {
    const days = classifyOpenSlotAttendance(
      baseInput({
        gameDays: [gameDay('2026-09-08')],
        encounters: [
          { encounterDate: d('2026-09-01'), team1: '1:5', team2: '2:3' },
          { encounterDate: d('2026-09-15'), team1: '1:2', team2: '3:4' },
        ],
      })
    );
    expect(days.map((day) => [day.date, day.noCheckIn])).toEqual([
      ['2026-09-15', true],
      ['2026-09-08', false],
      ['2026-09-01', true],
    ]);
    expect(lists(days[0])).toEqual({ registeredAndPlayed: [], registeredNotPlayed: [], playedNotRegistered: [] });
  });

  it('does not count an OUT vote or a withdrawn slot as registered', () => {
    const [day] = classifyOpenSlotAttendance(
      baseInput({
        gameDays: [
          gameDay('2026-09-01', {
            votes: [{ playerId: 5, choice: 'OUT', inheritedFromPlayerId: null }],
            openSlots: [
              { playerId: 5, status: 'ASSIGNED' },
              { playerId: 6, status: 'WITHDRAWN' },
            ],
          }),
        ],
      })
    );
    expect(day.registeredNotPlayed).toEqual([]);
  });

  it('counts unconfirmed slot holders and one-day nominees, with notes', () => {
    const [day] = classifyOpenSlotAttendance(
      baseInput({
        gameDays: [
          gameDay('2026-09-01', {
            votes: [
              { playerId: 1, choice: 'IN', inheritedFromPlayerId: null },
              { playerId: 2, choice: 'OUT', inheritedFromPlayerId: null },
              { playerId: 7, choice: 'IN', inheritedFromPlayerId: 3 },
            ],
            openSlots: [{ playerId: 5, status: 'ASSIGNED' }],
            nominations: [
              { nominatorPlayerId: 1, nomineePlayerId: 6, endedAt: d('2026-09-01'), endReason: 'SESSION_ENDED' },
              // Nominator went OUT - the nominee isn't coming.
              { nominatorPlayerId: 2, nomineePlayerId: 7, endedAt: null, endReason: null },
            ],
          }),
        ],
      })
    );
    expect(day.registeredNotPlayed.map((p) => [p.name, p.notes])).toEqual([
      ['Cat', ['held a slot, never confirmed']],
      ['Dan', ['standing in for Alice (one day)']],
      ['Eve', ['got a slot, never confirmed']],
    ]);
  });

  it('notes replacement cover up to its cancellation', () => {
    const days = classifyOpenSlotAttendance(
      baseInput({
        encounters: [
          { encounterDate: d('2026-09-08'), team1: '1:5', team2: '2:3' },
          { encounterDate: d('2026-09-15'), team1: '1:5', team2: '2:3' },
        ],
        replacements: [
          {
            replacementPlayerId: 5,
            fulltimePlayerName: 'Alice',
            startDate: d('2026-09-01'),
            endDate: d('2026-09-30'),
            cancelledAt: new Date('2026-09-10T12:00:00Z'),
          },
        ],
      })
    );
    expect(days.map((day) => [day.date, day.playedNotRegistered[0].notes])).toEqual([
      ['2026-09-15', []],
      ['2026-09-08', ["covering Alice's slot"]],
    ]);
  });

  it('leaves out today and later until something is recorded', () => {
    const registeredIn = { votes: [{ playerId: 5, choice: 'IN' as const, inheritedFromPlayerId: null }] };
    const days = classifyOpenSlotAttendance(
      baseInput({ gameDays: [gameDay('2026-10-03', registeredIn), gameDay('2026-10-02', registeredIn)] })
    );
    expect(days.map((day) => day.date)).toEqual(['2026-10-02']);
  });
});
