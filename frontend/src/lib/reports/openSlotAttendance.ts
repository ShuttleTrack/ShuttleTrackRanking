import type { GameDayOpenSlot, GameDaySlotNomination, GameDayVote } from '@prisma/client';
import prisma from '@/lib/prisma';
import { parseTeamIds } from '@/lib/ranking/playerUtil';
import { addCalendarDays, dateOnlyFromIso, isoFromDateOnly, localDateIso } from '@/lib/gameDay/clock';
import { scheduleTimezone, type SquadScheduleData } from '@/lib/squadSchedule';

// Open-slot players' registered-vs-played picture per day, for the squad admins' cost sharing.
// Three lists: registered and played, registered but not played, played without registering.
//
// "Played" = appears in at least one Encounter on that date (processed or not) - the app's own
// record of who was on court.
//
// "Registered" = held a place on that date's (non-cancelled) game day, read straight from the
// check-in rows rather than re-derived through lib/gameDay/eligibility.ts: that derivation uses
// the roster as it is NOW (statuses, pool membership), which can quietly drop someone from a
// past day. A player held a place when they:
//   - voted IN (a replacement covering a slot, or a confirmed open-slot assignee), or
//   - hold a slot without voting OUT: an ASSIGNED open slot or an inherited reservation they
//     never confirmed, or
//   - were the nominee of a one-day nomination that wasn't called off, whose nominator voted IN.
// The waiting list alone is not registration - those players never got a place.

export const OPEN_SLOT_ATTENDANCE_MONTHS = 2;

export interface OpenSlotAttendancePlayer {
  playerId: number;
  name: string;
  matches: number; // 0 in the registered-but-not-played list
  // Context that often changes how a day is settled: whose slot they were in, or that they held
  // a place without confirming.
  notes: string[];
}

export const ATTENDANCE_LISTS = ['registeredAndPlayed', 'registeredNotPlayed', 'playedNotRegistered'] as const;
export type AttendanceList = (typeof ATTENDANCE_LISTS)[number];

// One date and its three lists (any of which may be empty).
export interface OpenSlotAttendanceDay extends Record<AttendanceList, OpenSlotAttendancePlayer[]> {
  date: string; // YYYY-MM-DD
  // No game day (check-in) existed for this date - nobody could register, so everyone who played
  // lands in the "played without registering" list.
  noCheckIn: boolean;
}

export interface OpenSlotAttendanceReport {
  from: string;
  to: string;
  days: OpenSlotAttendanceDay[]; // newest first
}

export interface AttendanceEncounter {
  encounterDate: Date;
  team1: string;
  team2: string;
}

export interface AttendanceReplacement {
  replacementPlayerId: number;
  fulltimePlayerName: string;
  startDate: Date;
  endDate: Date;
  cancelledAt: Date | null;
}

export interface AttendanceGameDay {
  gameDate: Date;
  votes: Pick<GameDayVote, 'playerId' | 'choice' | 'inheritedFromPlayerId'>[];
  openSlots: Pick<GameDayOpenSlot, 'playerId' | 'status'>[];
  nominations: Pick<GameDaySlotNomination, 'nominatorPlayerId' | 'nomineePlayerId' | 'endedAt' | 'endReason'>[];
}

export interface AttendanceInput {
  openSlotPlayers: Map<number, string>;
  // Every squad player's name, for naming whose slot someone stood in.
  playerNames: Map<number, string>;
  gameDays: AttendanceGameDay[]; // non-cancelled only
  encounters: AttendanceEncounter[];
  replacements: AttendanceReplacement[];
  today: string;
}

// Same calendar-day clamping as Date.UTC: 31 Dec - 2 months is 31 Oct, 30 Apr - 2 months rolls
// to 2 Mar (no 30 Feb). Close enough for a report window.
export function subtractCalendarMonths(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return isoFromDateOnly(new Date(Date.UTC(y, m - 1 - months, d)));
}

function replacementCovering(playerId: number, date: string, replacements: AttendanceReplacement[]) {
  return replacements.find(
    (r) =>
      r.replacementPlayerId === playerId &&
      isoFromDateOnly(r.startDate) <= date &&
      date <= isoFromDateOnly(r.endDate) &&
      // A cancelled replacement still covered the days before it was cancelled.
      (r.cancelledAt === null || date < r.cancelledAt.toISOString().slice(0, 10))
  );
}

// Open-slot players who held a place on the game day, with why (as notes).
function registrations(gameDay: AttendanceGameDay, input: AttendanceInput): Map<number, string[]> {
  const registered = new Map<number, string[]>();
  const voteOf = new Map(gameDay.votes.map((v) => [v.playerId, v]));

  for (const vote of gameDay.votes) {
    if (!input.openSlotPlayers.has(vote.playerId) || vote.choice !== 'IN') continue;
    registered.set(vote.playerId, vote.inheritedFromPlayerId !== null ? ['held a slot, never confirmed'] : []);
  }
  for (const slot of gameDay.openSlots) {
    if (slot.status !== 'ASSIGNED' || !input.openSlotPlayers.has(slot.playerId)) continue;
    if (voteOf.get(slot.playerId)?.choice === 'OUT' || registered.has(slot.playerId)) continue;
    registered.set(slot.playerId, ['got a slot, never confirmed']);
  }
  for (const nomination of gameDay.nominations) {
    if (nomination.endedAt !== null && nomination.endReason !== 'SESSION_ENDED') continue;
    if (!input.openSlotPlayers.has(nomination.nomineePlayerId)) continue;
    if (voteOf.get(nomination.nominatorPlayerId)?.choice !== 'IN') continue;
    const nominator = input.playerNames.get(nomination.nominatorPlayerId) ?? `#${nomination.nominatorPlayerId}`;
    registered.set(nomination.nomineePlayerId, [`standing in for ${nominator} (one day)`]);
  }
  return registered;
}

function matchesByDate(input: AttendanceInput): Map<string, Map<number, number>> {
  const byDate = new Map<string, Map<number, number>>();
  for (const encounter of input.encounters) {
    const date = isoFromDateOnly(encounter.encounterDate);
    let day = byDate.get(date);
    if (!day) {
      day = new Map();
      byDate.set(date, day);
    }
    for (const id of [...parseTeamIds(encounter.team1), ...parseTeamIds(encounter.team2)]) {
      if (input.openSlotPlayers.has(id)) day.set(id, (day.get(id) ?? 0) + 1);
    }
  }
  return byDate;
}

// Pure classification step, separate from the queries so it can be tested without Prisma.
export function classifyOpenSlotAttendance(
  input: AttendanceInput
): OpenSlotAttendanceDay[] {
  const played = matchesByDate(input);
  const gameDayByDate = new Map(input.gameDays.map((g) => [isoFromDateOnly(g.gameDate), g]));
  const dates = Array.from(new Set([...Array.from(played.keys()), ...Array.from(gameDayByDate.keys())]))
    // A day with nothing recorded yet that hasn't finished (today, or a game day ahead) would
    // list every registered player as a no-show.
    .filter((date) => date < input.today || played.has(date))
    .sort((a, b) => b.localeCompare(a));

  // Every date that was played or had a check-in is listed, even with all three lists empty, so
  // the admin can see a session had no open-slot players rather than wonder if it's missing.
  return dates.map((date) => {
    const gameDay = gameDayByDate.get(date);
    const registered = gameDay ? registrations(gameDay, input) : new Map<number, string[]>();
    const matches = played.get(date) ?? new Map<number, number>();
    const day: OpenSlotAttendanceDay = {
      date,
      noCheckIn: !gameDay,
      registeredAndPlayed: [],
      registeredNotPlayed: [],
      playedNotRegistered: [],
    };

    const playerIds = new Set([...Array.from(registered.keys()), ...Array.from(matches.keys())]);
    playerIds.forEach((playerId) => {
      const replacement = replacementCovering(playerId, date, input.replacements);
      const entry: OpenSlotAttendancePlayer = {
        playerId,
        name: input.openSlotPlayers.get(playerId) ?? `#${playerId}`,
        matches: matches.get(playerId) ?? 0,
        notes: [
          ...(replacement ? [`covering ${replacement.fulltimePlayerName}'s slot`] : []),
          ...(registered.get(playerId) ?? []),
        ],
      };
      const list: AttendanceList = registered.has(playerId)
        ? entry.matches > 0
          ? 'registeredAndPlayed'
          : 'registeredNotPlayed'
        : 'playedNotRegistered';
      day[list].push(entry);
    });

    ATTENDANCE_LISTS.forEach((list) => day[list].sort((a, b) => a.name.localeCompare(b.name)));
    return day;
  });
}

export async function getOpenSlotAttendance(
  squadId: number,
  now: Date = new Date()
): Promise<OpenSlotAttendanceReport> {
  const squad = await prisma.squad.findUnique({ where: { id: squadId }, select: { schedule: true } });
  const timezone = scheduleTimezone((squad?.schedule ?? null) as SquadScheduleData | null);
  const to = localDateIso(now, timezone);
  const from = addCalendarDays(subtractCalendarMonths(to, OPEN_SLOT_ATTENDANCE_MONTHS), 1);
  const range = { gte: dateOnlyFromIso(from), lte: dateOnlyFromIso(to) };

  const [players, encounters, replacements, gameDays] = await Promise.all([
    prisma.player.findMany({ where: { squadId }, select: { id: true, name: true, playerType: true } }),
    prisma.encounter.findMany({
      where: { squadId, encounterDate: range },
      select: { encounterDate: true, team1: true, team2: true },
    }),
    prisma.slotReplacement.findMany({
      where: { squadId, startDate: { lte: range.lte }, endDate: { gte: range.gte } },
      select: {
        replacementPlayerId: true,
        startDate: true,
        endDate: true,
        cancelledAt: true,
        fulltimePlayer: { select: { name: true } },
      },
    }),
    prisma.gameDay.findMany({
      where: { squadId, gameDate: range, status: { not: 'CANCELLED' } },
      select: {
        gameDate: true,
        votes: { select: { playerId: true, choice: true, inheritedFromPlayerId: true } },
        openSlots: { select: { playerId: true, status: true } },
        slotNominations: { select: { nominatorPlayerId: true, nomineePlayerId: true, endedAt: true, endReason: true } },
      },
    }),
  ]);

  const days = classifyOpenSlotAttendance({
    openSlotPlayers: new Map(players.filter((p) => p.playerType === 'OPEN_SLOT').map((p) => [p.id, p.name])),
    playerNames: new Map(players.map((p) => [p.id, p.name])),
    gameDays: gameDays.map(({ slotNominations, ...g }) => ({ ...g, nominations: slotNominations })),
    encounters,
    replacements: replacements.map((r) => ({
      replacementPlayerId: r.replacementPlayerId,
      fulltimePlayerName: r.fulltimePlayer.name,
      startDate: r.startDate,
      endDate: r.endDate,
      cancelledAt: r.cancelledAt,
    })),
    today: to,
  });

  return { from, to, days };
}
