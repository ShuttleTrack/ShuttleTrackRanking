import { describe, expect, it } from 'vitest';
import type { Encounter } from '@/types/encounter';
import {
  buildEncounterHistoryUrl,
  buildEncounterQuery,
  duplicateTeamPlayerError,
  groupEncountersByDate,
  parseEncounterQuery,
  summarizeEncounters,
} from './encounterHistory';

const sampleEncounter = (overrides: Partial<Encounter> = {}): Encounter => ({
  encounterDate: '2024-03-01',
  encounterId: 1,
  encounterScore: 2.5,
  opponentTeam: [{ playerId: 2, playerName: 'Bob' }],
  opponentTeamPoints: 15,
  playerTeam: [{ playerId: 1, playerName: 'Alice' }],
  playerTeamPoints: 21,
  ...overrides,
});

describe('parseEncounterQuery', () => {
  it('parses a1–b2 from query', () => {
    expect(parseEncounterQuery({ a1: '10', a2: '20', b1: '30', b2: '40' })).toEqual({
      teamA1: 10,
      teamA2: 20,
      teamB1: 30,
      teamB2: 40,
    });
  });

  it('ignores invalid or missing values', () => {
    expect(parseEncounterQuery({ a1: 'x', b2: ['0'] })).toEqual({
      teamA1: 0,
      teamA2: 0,
      teamB1: 0,
      teamB2: 0,
    });
  });
});

describe('buildEncounterQuery', () => {
  it('omits zero slots', () => {
    expect(buildEncounterQuery({ teamA1: 5, teamA2: 0, teamB1: 7, teamB2: 0 })).toEqual({
      a1: '5',
      b1: '7',
    });
  });
});

describe('duplicateTeamPlayerError', () => {
  it('returns null when all unique', () => {
    expect(
      duplicateTeamPlayerError({ teamA1: 1, teamA2: 2, teamB1: 3, teamB2: 4 }),
    ).toBeNull();
  });

  it('detects duplicates', () => {
    expect(
      duplicateTeamPlayerError({ teamA1: 1, teamA2: 1, teamB1: 0, teamB2: 0 }),
    ).toMatch(/multiple times/);
  });
});

describe('summarizeEncounters', () => {
  it('counts wins when player team scores higher', () => {
    const summary = summarizeEncounters([
      sampleEncounter({ encounterId: 1, playerTeamPoints: 21, opponentTeamPoints: 15 }),
      sampleEncounter({
        encounterId: 2,
        playerTeamPoints: 10,
        opponentTeamPoints: 21,
        encounterScore: -1,
      }),
      sampleEncounter({
        encounterId: 3,
        playerTeamPoints: 15,
        opponentTeamPoints: 15,
        encounterScore: 0,
      }),
    ]);
    expect(summary).toEqual({
      totalGames: 3,
      wins: 1,
      losses: 2,
      winRate: (1 / 3) * 100,
    });
  });
});

describe('groupEncountersByDate', () => {
  it('groups by date newest first and sums scores', () => {
    const grouped = groupEncountersByDate([
      sampleEncounter({ encounterDate: '2024-01-01', encounterId: 1, encounterScore: 1 }),
      sampleEncounter({ encounterDate: '2024-02-01', encounterId: 2, encounterScore: 2 }),
      sampleEncounter({ encounterDate: '2024-02-01', encounterId: 3, encounterScore: -0.5 }),
    ]);
    expect(grouped.dateKeys).toEqual(['2024-02-01', '2024-01-01']);
    expect(grouped.encountersByDate['2024-02-01']).toHaveLength(2);
    expect(grouped.scoreSumByDate['2024-02-01']).toBe(1.5);
    expect(grouped.scoreSumByDate['2024-01-01']).toBe(1);
  });
});

describe('buildEncounterHistoryUrl', () => {
  it('returns null without teamA1', () => {
    expect(buildEncounterHistoryUrl(7, { teamA1: 0, teamA2: 0, teamB1: 0, teamB2: 0 })).toBeNull();
  });

  it('builds API url with all slots, scoped to the squad', () => {
    expect(
      buildEncounterHistoryUrl(7, { teamA1: 1, teamA2: 2, teamB1: 3, teamB2: 4 }),
    ).toBe('/api/squads/7/encounters/history?teamA1=1&teamA2=2&teamB1=3&teamB2=4');
  });
});
