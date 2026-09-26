import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  expectedShare,
  inactivityDemerit,
  matchDeltas,
  replayPublicRatings,
  seedRating,
  tierFactors,
  weekStart,
  type PublicEncounterInput,
} from './publicRating';
import { decideAbsenteeAction, decideActiveReplacementAbsenteeAction } from './absenteeManager';

const HIGH = { squadId: 1, weight: 0.9 };
const LOW = { squadId: 2, weight: 0.3 };

let nextId = 1;
function match(
  squad: { squadId: number; weight: number },
  date: string,
  team1: number[],
  team2: number[],
  team1SetPoints: number,
  team2SetPoints: number,
  overrides: Partial<PublicEncounterInput> = {}
): PublicEncounterInput {
  return {
    id: nextId++,
    squadId: squad.squadId,
    weight: squad.weight,
    encounterDate: date,
    team1: team1.join(':'),
    team2: team2.join(':'),
    team1SetPoints,
    team2SetPoints,
    processed: true,
    ...overrides,
  };
}

// Player id n belongs to person "pn" unless mapped otherwise.
function people(...ids: number[]): Map<number, string> {
  return new Map(ids.map((id) => [id, `p${id}`]));
}

// Mondays of consecutive ISO weeks starting 2026-01-05.
function week(n: number, dayOffset = 2): string {
  const d = new Date(Date.UTC(2026, 0, 5 + 7 * n + dayOffset));
  return d.toISOString().slice(0, 10);
}

const FAR_FUTURE = '2100-01-01';

describe('expectedShare', () => {
  it('matches the plan: rating gap to expected point share', () => {
    expect(expectedShare(1850, 1250)).toBeCloseTo(0.849, 3);
    expect(expectedShare(1700, 1400)).toBeCloseTo(0.703, 3);
    expect(expectedShare(1550, 1550)).toBe(0.5);
    expect(expectedShare(1600, 1500)).toBeCloseTo(0.571, 3);
    expect(expectedShare(1700, 1500)).toBeCloseTo(0.64, 3);
  });
});

describe('tierFactors', () => {
  it('raises gain with weight, keeps loss at or below gain, and softens losses at higher weights', () => {
    let previous = tierFactors(0);
    for (let w = 0.05; w <= 1.0001; w += 0.05) {
      const current = tierFactors(w);
      expect(current.gain).toBeGreaterThan(previous.gain);
      expect(current.loss).toBeLessThanOrEqual(current.gain);
      expect(current.loss / current.gain).toBeLessThan(previous.loss / previous.gain);
      previous = current;
    }
  });

  it('gives the planned multipliers (loss = gain x (1 - w/2))', () => {
    expect(tierFactors(0.9)).toEqual({ gain: 0.95, loss: expect.closeTo(0.5225, 10) });
    expect(tierFactors(0.3)).toEqual({ gain: 0.65, loss: expect.closeTo(0.5525, 10) });
  });
});

describe('matchDeltas (worked examples)', () => {
  const even = (weight: number, p1: number, p2: number) =>
    matchDeltas({ team1Rating: 1600, team2Rating: 1600, team1Points: p1, team2Points: p2, weight });

  it('0.9 squad, evenly matched, 21-15', () => {
    const r = even(0.9, 21, 15);
    expect(r.team1.actual).toBe(1);
    expect(r.team2.actual).toBe(0);
    expect(r.team1.delta).toBeCloseTo(9.77, 2);
    expect(r.team2.delta).toBeCloseTo(-5.37, 2);
  });

  it('0.9 squad, evenly matched, 21-5', () => {
    const r = even(0.9, 21, 5);
    expect(r.team1.delta).toBeCloseTo(13.39, 1);
    expect(r.team2.delta).toBeCloseTo(-7.36, 2);
  });

  it('0.3 squad, evenly matched, 21-15', () => {
    const r = even(0.3, 21, 15);
    expect(r.team1.delta).toBeCloseTo(6.69, 2);
    expect(r.team2.delta).toBeCloseTo(-5.68, 2);
  });

  it('0.3 squad, the stronger team still gains when it wins', () => {
    const r = matchDeltas({ team1Rating: 1600, team2Rating: 1400, team1Points: 21, team2Points: 15, weight: 0.3 });
    expect(r.team1.expected).toBeCloseTo(0.64, 2);
    expect(r.team1.delta).toBeGreaterThan(0);
    expect(r.team2.delta).toBeLessThan(0);
  });

  it('0.3 squad, the stronger team wins big and gains more', () => {
    const r = matchDeltas({ team1Rating: 1600, team2Rating: 1400, team1Points: 21, team2Points: 8, weight: 0.3 });
    expect(r.team1.delta).toBeGreaterThan(5);
    expect(r.team2.delta).toBeLessThan(-5);
  });

  it('0.9 squad, a weaker team losing close to a stronger one loses rating', () => {
    const r = matchDeltas({ team1Rating: 1450, team2Rating: 1700, team1Points: 17, team2Points: 21, weight: 0.9 });
    expect(r.team1.delta).toBeLessThan(0);
    expect(r.team2.delta).toBeGreaterThan(0);
    expect(r.team1.delta).toBeCloseTo(-3.28, 1);
    expect(r.team2.delta).toBeCloseTo(5.93, 1);
  });
});

describe('seeding', () => {
  it('depends on the weight only: 1700 at 0.9, 1400 at 0.3, 1500 at 0.5', () => {
    expect(seedRating(0.9)).toBe(1700);
    expect(seedRating(0.3)).toBeCloseTo(1400, 10);
    expect(seedRating(0.5)).toBe(1500);
  });

  it('puts the 0.9 and 0.3 middles 300 apart, about 21-9 expected', () => {
    expect(seedRating(0.9) - seedRating(0.3)).toBeCloseTo(300, 10);
    expect(expectedShare(seedRating(0.9), seedRating(0.3))).toBeCloseTo(0.703, 3);
  });

  it('starts everyone in the same squad equal, whatever the day', () => {
    const encounters = [
      match(HIGH, week(0), [1, 2], [3, 4], 21, 10),
      match(HIGH, week(1), [5, 6], [1, 2], 21, 10),
    ];
    const { events } = replayPublicRatings(encounters, people(1, 2, 3, 4, 5, 6), FAR_FUTURE);
    const seeds = events.filter((e) => e.kind === 'SEED');
    expect(seeds).toHaveLength(6);
    expect(seeds.every((e) => e.newRating === 1700 && e.details.weight === 0.9)).toBe(true);
  });

  it('seeds from the first match only - a later match in a higher-weight squad does not re-seed', () => {
    const first = match(LOW, '2026-01-02', [1, 2], [3, 4], 21, 10);
    const later = match(HIGH, '2026-01-07', [1, 5], [6, 7], 21, 10);
    const { events, ratings } = replayPublicRatings([later, first], people(1, 2, 3, 4, 5, 6, 7), FAR_FUTURE);
    const p1Seeds = events.filter((e) => e.email === 'p1' && e.kind === 'SEED');
    expect(p1Seeds).toHaveLength(1);
    expect(p1Seeds[0].newRating).toBeCloseTo(1400, 10);
    expect(ratings.get('p1')!.seed).toBeCloseTo(1400, 10);
    expect(ratings.get('p5')!.seed).toBe(1700);
  });
});

describe('replayPublicRatings', () => {
  it('gives one combined rating to a person who plays in two squads', () => {
    const map = new Map<number, string>([
      [1, 'alice'],
      [11, 'alice'],
      [2, 'p2'],
      [3, 'p3'],
      [4, 'p4'],
      [12, 'p12'],
      [13, 'p13'],
      [14, 'p14'],
    ]);
    const encounters = [
      match(HIGH, week(0, 2), [1, 2], [3, 4], 21, 15),
      match(LOW, week(0, 4), [11, 12], [13, 14], 21, 15),
    ];
    const { ratings, events } = replayPublicRatings(encounters, map, FAR_FUTURE);
    const alice = ratings.get('alice')!;
    expect(alice.matches).toBe(2);
    expect(alice.seed).toBe(1700);
    const aliceEvents = events.filter((e) => e.email === 'alice');
    expect(aliceEvents.map((e) => [e.kind, e.squadId])).toEqual([
      ['SEED', HIGH.squadId],
      ['MATCH', HIGH.squadId],
      ['MATCH', LOW.squadId],
    ]);
    // The second match starts from the rating the first one left her with.
    expect(aliceEvents[2].oldRating).toBe(aliceEvents[1].newRating);
    expect(alice.rating).toBe(aliceEvents[2].newRating);
  });

  it('uses the known partner alone when one partner id is unknown', () => {
    const e = match(HIGH, week(0), [1, 99], [3, 4], 21, 15);
    const { ratings } = replayPublicRatings([e], people(1, 3, 4), FAR_FUTURE);
    expect(ratings.has('p1')).toBe(true);
    expect(ratings.get('p1')!.rating).toBeGreaterThan(1700);
    expect(ratings.get('p1')!.matches).toBe(1);
  });

  it('skips unprocessed and 0-0 encounters', () => {
    const encounters = [
      match(HIGH, week(0), [1, 2], [3, 4], 21, 10, { processed: false }),
      match(HIGH, week(0), [1, 2], [3, 4], 0, 0),
    ];
    const { ratings, events } = replayPublicRatings(encounters, people(1, 2, 3, 4), FAR_FUTURE);
    expect(ratings.size).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('is deterministic regardless of input order', () => {
    const encounters = [
      match(HIGH, week(0), [1, 2], [3, 4], 21, 15),
      match(LOW, week(1), [1, 3], [2, 4], 18, 21),
      match(HIGH, week(1), [1, 4], [2, 3], 21, 19),
      match(HIGH, week(3), [2, 3], [1, 4], 21, 12),
    ];
    const map = people(1, 2, 3, 4);
    const a = replayPublicRatings(encounters, map, FAR_FUTURE);
    const b = replayPublicRatings([...encounters].reverse(), map, FAR_FUTURE);
    expect(Array.from(b.ratings.entries())).toEqual(Array.from(a.ratings.entries()));
    expect(b.events).toEqual(a.events);
  });

  it('levels off a dominant player who only plays in a low-weight squad', () => {
    const peers = [2, 3, 4, 5, 6, 7, 8];
    const encounters: PublicEncounterInput[] = [];
    for (let n = 0; n < 300; n++) {
      const rotated = peers.map((_, i) => peers[(i + n) % peers.length]);
      encounters.push(match(LOW, week(n), [1, rotated[0]], [rotated[1], rotated[2]], 21, 9));
      encounters.push(match(LOW, week(n), [rotated[3], rotated[4]], [rotated[5], rotated[6]], 21, 19));
      encounters.push(match(LOW, week(n), [rotated[5], rotated[6]], [rotated[3], rotated[4]], 21, 19));
    }
    const { events } = replayPublicRatings(encounters, people(1, ...peers), FAR_FUTURE);
    const dominantMatches = events.filter((e) => e.email === 'p1' && e.kind === 'MATCH');
    const firstRaw = dominantMatches[0].details.raw;
    const lastRaw = dominantMatches[dominantMatches.length - 1].details.raw;
    expect(firstRaw).toBeGreaterThan(8);
    expect(Math.abs(lastRaw)).toBeLessThan(firstRaw / 2);
  });
});

describe('inactivity', () => {
  it('ladder is -10, -20, -30, -30... from the first missed week', () => {
    expect([1, 2, 3, 4, 10].map(inactivityDemerit)).toEqual([10, 20, 30, 30, 30]);
  });

  it('uses the same amounts as the squad absentee penalty', () => {
    for (let n = 1; n <= 6; n++) {
      expect(-inactivityDemerit(n)).toBe(decideActiveReplacementAbsenteeAction(n).points);
    }
    for (let n = 1; n <= 5; n++) {
      expect(decideAbsenteeAction(n - 1)).toEqual({ action: 'demerit', points: -inactivityDemerit(n) });
    }
  });

  it('penalises every consecutive missed game week and resets after playing', () => {
    const encounters = [match(HIGH, week(0), [1, 2], [3, 4], 21, 21)];
    for (let n = 1; n <= 4; n++) encounters.push(match(HIGH, week(n), [2, 5], [3, 4], 21, 21));
    encounters.push(match(HIGH, week(5), [1, 2], [3, 4], 21, 21));
    encounters.push(match(HIGH, week(6), [2, 5], [3, 4], 21, 21));
    const { events, ratings } = replayPublicRatings(encounters, people(1, 2, 3, 4, 5), FAR_FUTURE);
    const demerits = events.filter((e) => e.email === 'p1' && e.kind === 'INACTIVITY').map((e) => e.delta);
    expect(demerits).toEqual([-10, -20, -30, -30, -10]);
    expect(ratings.get('p1')!.missedWeeks).toBe(1);
  });

  it('costs nothing in a week when no public squad played', () => {
    const encounters = [
      match(HIGH, week(0), [1, 2], [3, 4], 21, 21),
      match(HIGH, week(2), [2, 5], [3, 4], 21, 21),
    ];
    const { events } = replayPublicRatings(encounters, people(1, 2, 3, 4, 5), FAR_FUTURE);
    expect(events.filter((e) => e.email === 'p1' && e.kind === 'INACTIVITY').map((e) => e.delta)).toEqual([-10]);
  });

  it('never penalises a two-squad member who plays one squad each week', () => {
    const encounters: PublicEncounterInput[] = [];
    for (let n = 0; n < 6; n++) {
      const squad = n % 2 === 0 ? HIGH : LOW;
      encounters.push(match(squad, week(n), [1, 2], [3, 4], 21, 18));
      encounters.push(match(n % 2 === 0 ? LOW : HIGH, week(n, 4), [5, 6], [7, 8], 21, 18));
    }
    const { events } = replayPublicRatings(encounters, people(1, 2, 3, 4, 5, 6, 7, 8), FAR_FUTURE);
    expect(events.filter((e) => e.email === 'p1' && e.kind === 'INACTIVITY')).toHaveLength(0);
  });

  it('drops a one-strong-day player below the regulars they overtook', () => {
    const encounters = [
      match(HIGH, week(0), [1, 2], [3, 4], 21, 10),
      match(HIGH, week(0), [1, 5], [3, 4], 21, 10),
    ];
    for (let n = 1; n <= 4; n++) {
      encounters.push(match(HIGH, week(n), [2, 3], [4, 5], 21, 19));
      encounters.push(match(HIGH, week(n), [4, 5], [2, 3], 21, 19));
    }
    const map = people(1, 2, 3, 4, 5);
    const afterDayOne = replayPublicRatings(encounters.slice(0, 2), map, week(0, 3));
    const regulars = ['p2', 'p3', 'p4', 'p5'];
    expect(regulars.every((p) => afterDayOne.ratings.get('p1')!.rating > afterDayOne.ratings.get(p)!.rating)).toBe(true);

    const { ratings } = replayPublicRatings(encounters, map, FAR_FUTURE);
    expect(regulars.every((p) => ratings.get('p1')!.rating < ratings.get(p)!.rating)).toBe(true);
  });

  it('leaves the current, unfinished week alone', () => {
    const encounters = [
      match(HIGH, week(0), [1, 2], [3, 4], 21, 21),
      match(HIGH, week(1, 2), [2, 5], [3, 4], 21, 21),
    ];
    const midWeek = week(1, 3);
    const { events } = replayPublicRatings(encounters, people(1, 2, 3, 4, 5), midWeek);
    expect(events.filter((e) => e.kind === 'INACTIVITY')).toHaveLength(0);
  });
});

describe('weekStart', () => {
  it('returns the ISO Monday', () => {
    expect(weekStart('2026-09-26')).toBe('2026-09-21');
    expect(weekStart('2026-09-21')).toBe('2026-09-21');
    expect(weekStart('2026-09-27')).toBe('2026-09-21');
  });
});

describe('weight is the only driver', () => {
  it('never names a squad in the rating logic', () => {
    const source = readFileSync(path.join(__dirname, 'publicRating.ts'), 'utf8');
    expect(source).not.toMatch(/wednesday|friday/i);
  });
});
