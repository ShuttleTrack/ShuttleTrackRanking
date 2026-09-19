import { describe, expect, it } from 'vitest';
import type { RawEncounter } from './playerForm';
import {
  computeLastGameDayNet,
  encounterScoreForPlayer,
} from './playerLastGameDay';

const base = (overrides: Partial<RawEncounter>): RawEncounter => ({
  team1: '1:2',
  team2: '3:4',
  encounterDate: '2024-01-01',
  processed: true,
  team1SetPoints: 21,
  team2SetPoints: 15,
  ...overrides,
});

const breakdownJson = (team1Final: number, team2Final: number) =>
  JSON.stringify({
    team1: { baseElo: team1Final, tierAdjustment: 0, consolation: 0, finalScore: team1Final },
    team2: { baseElo: team2Final, tierAdjustment: 0, consolation: 0, finalScore: team2Final },
  });

describe('encounterScoreForPlayer', () => {
  it('uses scoreBreakdown finalScore for player team', () => {
    const encounter = base({
      scoreBreakdown: breakdownJson(5.5, -5.5),
    });
    expect(encounterScoreForPlayer(encounter, 1)).toBe(5.5);
    expect(encounterScoreForPlayer(encounter, 3)).toBe(-5.5);
  });

  it('signs calculatedScore when player lost and no breakdown', () => {
    const encounter = base({
      calculatedScore: 8,
      team1SetPoints: 10,
      team2SetPoints: 21,
    });
    expect(encounterScoreForPlayer(encounter, 1)).toBe(-8);
  });

  it('returns null when player not in encounter', () => {
    expect(encounterScoreForPlayer(base({}), 99)).toBeNull();
  });
});

describe('computeLastGameDayNet', () => {
  it('returns null when player has no processed encounters', () => {
    expect(computeLastGameDayNet(1, [])).toBeNull();
  });

  it('sums scores on the player latest played date only', () => {
    const encounters: RawEncounter[] = [
      base({
        id: 1,
        encounterDate: '2024-01-01',
        scoreBreakdown: breakdownJson(3, -3),
      }),
      base({
        id: 2,
        encounterDate: '2024-02-01',
        team1: '1:2',
        team2: '5:6',
        scoreBreakdown: breakdownJson(4, -4),
      }),
      base({
        id: 3,
        encounterDate: '2024-02-01',
        team1: '1:2',
        team2: '7:8',
        team1SetPoints: 12,
        team2SetPoints: 21,
        scoreBreakdown: breakdownJson(-2, 2),
      }),
    ];

    expect(computeLastGameDayNet(1, encounters)).toBe(2);
  });

  it('uses player last day not global latest date when player sat out', () => {
    const encounters: RawEncounter[] = [
      base({
        id: 1,
        encounterDate: '2024-01-15',
        team1: '1:2',
        team2: '3:4',
        scoreBreakdown: breakdownJson(10, -10),
      }),
      base({
        id: 2,
        encounterDate: '2024-03-01',
        team1: '5:6',
        team2: '7:8',
        scoreBreakdown: breakdownJson(1, -1),
      }),
    ];

    expect(computeLastGameDayNet(1, encounters)).toBe(10);
  });
});
