import { describe, it, expect } from 'vitest';
import type { Encounter as PrismaEncounter } from '@prisma/client';
import { playerSide, playerTeamBreakdown, toRawEncounter } from './encounters';

function encounter(overrides: Partial<PrismaEncounter> = {}): PrismaEncounter {
  return {
    id: 1,
    team1: '3:7',
    team2: '4:8',
    encounterDate: new Date(Date.UTC(2026, 8, 2)),
    processed: true,
    team1SetPoints: 21,
    team2SetPoints: 15,
    calculatedScore: 10,
    groupIndex: null,
    totalGroups: null,
    scoreBreakdown: null,
    ...overrides,
  };
}

describe('playerSide (ported EncounterService.getPlayerTeam)', () => {
  it('team1 member -> 1', () => {
    expect(playerSide(encounter(), 3)).toBe(1);
  });

  it('team2 member -> 2', () => {
    expect(playerSide(encounter(), 4)).toBe(2);
  });

  it('unknown player defaults to 2, matching the Java fallback rather than throwing', () => {
    expect(playerSide(encounter(), 999)).toBe(2);
  });
});

describe('playerTeamBreakdown (ported EncounterService.getPlayerTeamBreakdown)', () => {
  const breakdown = {
    team1: { baseElo: 10, tierAdjustment: 0, consolation: 0, finalScore: 10 },
    team2: { baseElo: -10, tierAdjustment: 0, consolation: 0, finalScore: -10 },
    groupIndex: 0,
    totalGroups: 0,
    tierFactor: 0,
    scoreGapTriggered: false,
  };

  it('null scoreBreakdown -> null', () => {
    expect(playerTeamBreakdown(encounter({ scoreBreakdown: null }), 3)).toBeNull();
  });

  it('picks team1 sub-breakdown for a team1 player', () => {
    expect(playerTeamBreakdown(encounter({ scoreBreakdown: breakdown as never }), 3)).toEqual(breakdown.team1);
  });

  it('picks team2 sub-breakdown for a team2 player', () => {
    expect(playerTeamBreakdown(encounter({ scoreBreakdown: breakdown as never }), 4)).toEqual(breakdown.team2);
  });
});

describe('toRawEncounter (ported GET /encounters raw shape)', () => {
  it('re-stringifies scoreBreakdown to match Java\'s String-typed field (not a nested object)', () => {
    const breakdown = { team1: { baseElo: 10 } };
    const raw = toRawEncounter(encounter({ scoreBreakdown: breakdown as never }));
    expect(typeof raw.scoreBreakdown).toBe('string');
    expect(JSON.parse(raw.scoreBreakdown as string)).toEqual(breakdown);
  });

  it('null scoreBreakdown stays null (not the string "null")', () => {
    const raw = toRawEncounter(encounter({ scoreBreakdown: null }));
    expect(raw.scoreBreakdown).toBeNull();
  });

  it('encounterDate becomes a yyyy-MM-dd string', () => {
    const raw = toRawEncounter(encounter({ encounterDate: new Date(Date.UTC(2026, 8, 2)) }));
    expect(raw.encounterDate).toBe('2026-09-02');
  });
});
