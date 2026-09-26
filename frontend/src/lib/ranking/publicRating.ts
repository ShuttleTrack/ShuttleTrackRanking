import { round2 } from './round';
import { parseTeamIds } from './playerUtil';
import { DEMERIT_POINTS_ABSENTEE, absenteeMultiplierForSpell } from './absenteeManager';

// Public leaderboard rating: one rating per person (email) across every public squad, rebuilt by
// replaying all public-squad matches in date order. Win/loss Elo (margin scales the change) with a
// per-squad weight (FIFA-style match importance plus a softer loss at higher tiers).
// Pure - the DB loading/persisting lives in publicRatingRecalc.ts. Everything tier-related comes
// from the squad's publicWeight (0..1); no squad is ever special-cased by name.

export const K = 16;
export const DIVISOR = 800;
export const SEED_BASE = 1500;
export const WEIGHT_SPREAD = 500;

export interface PublicEncounterInput {
  id: number;
  squadId: number;
  weight: number;
  encounterDate: string; // YYYY-MM-DD
  team1: string;
  team2: string;
  team1SetPoints: number;
  team2SetPoints: number;
  processed: boolean;
}

export interface PersonRating {
  rating: number;
  seed: number;
  matches: number;
  lastPlayed: string | null;
  missedWeeks: number;
}

export type PublicRatingEventKind = 'SEED' | 'MATCH' | 'INACTIVITY';

export interface PublicRatingEventInput {
  email: string;
  kind: PublicRatingEventKind;
  eventDate: string;
  encounterId: number | null;
  squadId: number | null;
  oldRating: number;
  newRating: number;
  delta: number;
  details: Record<string, number>;
}

export interface ReplayResult {
  ratings: Map<string, PersonRating>;
  events: PublicRatingEventInput[];
}

export function expectedShare(teamRating: number, oppRating: number): number {
  return 1 / (1 + Math.pow(10, (oppRating - teamRating) / DIVISOR));
}

export function tierFactors(weight: number): { gain: number; loss: number } {
  const gain = (1 + weight) / 2;
  return { gain, loss: gain * (1 - weight / 2) };
}

// The middle of the squad of the person's first public match. Squad standing is deliberately
// ignored: a squad's first-day scores can be admin-set, and those must not buy a head start.
export function seedRating(weight: number): number {
  return SEED_BASE + WEIGHT_SPREAD * (weight - 0.5);
}

// Same amounts as the squad absentee penalty (-10/-20/-30, the last repeating), but counted per
// consecutive fully missed public game week rather than per squad game day.
export function inactivityDemerit(missedWeeks: number): number {
  return absenteeMultiplierForSpell(missedWeeks) * -DEMERIT_POINTS_ABSENTEE;
}

export interface MatchDeltaInput {
  team1Rating: number;
  team2Rating: number;
  team1Points: number;
  team2Points: number;
  weight: number;
}

export interface TeamDelta {
  delta: number;
  expected: number;
  actual: number;
  margin: number;
  raw: number;
  factor: number;
}

function marginMultiplier(teamPoints: number, oppPoints: number): number {
  const higher = Math.max(teamPoints, oppPoints);
  return 1 + Math.abs(teamPoints - oppPoints) / higher;
}

export function matchDeltas(input: MatchDeltaInput): { team1: TeamDelta; team2: TeamDelta } {
  const { gain, loss } = tierFactors(input.weight);
  const mov = marginMultiplier(input.team1Points, input.team2Points);
  const team = (rating: number, oppRating: number, points: number, oppPoints: number): TeamDelta => {
    const expected = expectedShare(rating, oppRating);
    const actual = points > oppPoints ? 1 : 0;
    const raw = K * mov * (actual - expected);
    const factor = raw > 0 ? gain : loss;
    return { delta: round2(raw * factor), expected, actual, margin: mov, raw, factor };
  };
  return {
    team1: team(input.team1Rating, input.team2Rating, input.team1Points, input.team2Points),
    team2: team(input.team2Rating, input.team1Rating, input.team2Points, input.team1Points),
  };
}

function isCountable(e: PublicEncounterInput): boolean {
  return e.processed && e.team1SetPoints + e.team2SetPoints > 0;
}

function sortedCountable(encounters: PublicEncounterInput[]): PublicEncounterInput[] {
  return encounters
    .filter(isCountable)
    .sort((a, b) => (a.encounterDate === b.encounterDate ? a.id - b.id : a.encounterDate < b.encounterDate ? -1 : 1));
}

function parseDateUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Monday of the ISO week containing `date`.
export function weekStart(date: string): string {
  const d = parseDateUtc(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return formatDateUtc(d);
}

function weekIsOver(weekMonday: string, asOf: string): boolean {
  const nextMonday = parseDateUtc(weekMonday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  return formatDateUtc(nextMonday) <= asOf;
}

// Replays every countable match in date/id order, seeding each person at their first one. A public
// game week is an ISO week with at least one countable match; at the end of each one that is over
// by `asOf`, everyone already seeded who didn't play that week takes the next inactivity demerit.
// The current week is left alone so a squad that plays later in the week isn't docked in between.
export function replayPublicRatings(
  encounters: PublicEncounterInput[],
  personKeyByPlayerId: Map<number, string>,
  asOf: string
): ReplayResult {
  const ratings = new Map<string, PersonRating>();
  const events: PublicRatingEventInput[] = [];

  const byWeek = new Map<string, PublicEncounterInput[]>();
  for (const e of sortedCountable(encounters)) {
    const key = weekStart(e.encounterDate);
    const list = byWeek.get(key) ?? [];
    list.push(e);
    byWeek.set(key, list);
  }

  byWeek.forEach((weekEncounters, weekMonday) => {
    const playedThisWeek = new Set<string>();

    for (const e of weekEncounters) {
      const teams = [e.team1, e.team2].map((team) =>
        Array.from(
          new Set(
            parseTeamIds(team)
              .map((id) => personKeyByPlayerId.get(id))
              .filter((p): p is string => p !== undefined)
          )
        )
      );
      if (teams[0].length === 0 || teams[1].length === 0) continue;

      for (const person of [...teams[0], ...teams[1]]) {
        if (ratings.has(person)) continue;
        const seed = round2(seedRating(e.weight));
        ratings.set(person, { rating: seed, seed, matches: 0, lastPlayed: null, missedWeeks: 0 });
        events.push({
          email: person,
          kind: 'SEED',
          eventDate: e.encounterDate,
          encounterId: e.id,
          squadId: e.squadId,
          oldRating: seed,
          newRating: seed,
          delta: 0,
          details: { weight: e.weight },
        });
      }

      const teamRating = (members: string[]) =>
        members.reduce((sum, p) => sum + ratings.get(p)!.rating, 0) / members.length;
      const result = matchDeltas({
        team1Rating: teamRating(teams[0]),
        team2Rating: teamRating(teams[1]),
        team1Points: e.team1SetPoints,
        team2Points: e.team2SetPoints,
        weight: e.weight,
      });

      ([
        [teams[0], result.team1],
        [teams[1], result.team2],
      ] as const).forEach(([members, team]) => {
        for (const person of members) {
          const state = ratings.get(person)!;
          const oldRating = state.rating;
          state.rating = round2(oldRating + team.delta);
          state.matches += 1;
          state.lastPlayed = e.encounterDate;
          playedThisWeek.add(person);
          events.push({
            email: person,
            kind: 'MATCH',
            eventDate: e.encounterDate,
            encounterId: e.id,
            squadId: e.squadId,
            oldRating,
            newRating: state.rating,
            delta: team.delta,
            details: {
              weight: e.weight,
              expected: round4(team.expected),
              actual: round4(team.actual),
              margin: round4(team.margin),
              raw: round4(team.raw),
              factor: team.factor,
            },
          });
        }
      });
    }

    if (!weekIsOver(weekMonday, asOf)) return;
    const weekLastDate = weekEncounters[weekEncounters.length - 1].encounterDate;
    ratings.forEach((state, person) => {
      if (playedThisWeek.has(person)) {
        state.missedWeeks = 0;
        return;
      }
      state.missedWeeks += 1;
      const demerit = inactivityDemerit(state.missedWeeks);
      const oldRating = state.rating;
      state.rating = round2(oldRating - demerit);
      events.push({
        email: person,
        kind: 'INACTIVITY',
        eventDate: weekLastDate,
        encounterId: null,
        squadId: null,
        oldRating,
        newRating: state.rating,
        delta: -demerit,
        details: { missedWeeks: state.missedWeeks },
      });
    });
  });

  return { ratings, events };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
