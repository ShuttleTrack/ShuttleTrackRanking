import { describe, it, expect } from 'vitest';
import fixtures from './__fixtures__/characterization.json';
import { calculateElo } from './eloCalculator';
import { decideAbsenteeAction, ABSENTEE_ENCOUNTER_ID, DISABLE_PLAYER_ENCOUNTER_ID } from './absenteeManager';
import { computeActivationScore } from './activation';

/**
 * MIGRATION_PLAN.md Phase 0 + Phase 3.
 *
 * `__fixtures__/characterization.json` is captured oracle output from the *real* Java
 * EloRankScoreCalculator / ScorePersister / CommonAbsenteeManager - captured via a
 * CharacterizationFixtureGenerator.java test harness that lived in `backend/` before the Java
 * backend was fully migrated and deleted (Phase 8 - see MIGRATION_PLAN.md). This fixture is
 * now frozen history: there's no live Java source left to regenerate it from, so treat it as
 * the permanent oracle for the ranking math, not something to refresh.
 *
 * The bit-for-bit checks below run the Phase 3 TS port (eloCalculator / absenteeManager /
 * activation) against every one of these captured scenarios.
 */

function average(scores: number[]): number {
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
describe('characterization fixtures (Phase 0 oracle)', () => {
  it('covers every scenario category required by MIGRATION_PLAN.md Phase 0', () => {
    const eloNames = fixtures.eloScenarios.map((s) => s.name);
    const absenteeNames = fixtures.absenteeScenarios.map((s) => s.name);
    const activationNames = fixtures.activationScenarios.map((s) => s.name);

    // normal win/loss
    expect(eloNames).toContain('normal_close_win');
    expect(eloNames).toContain('normal_upset_loss');
    // tier-boost-triggered matches (score gap >= 200)
    expect(eloNames).toContain('tier_win_boost');
    // consolation-triggered losses
    expect(eloNames).toContain('tier_loss_consolation_capped');
    expect(eloNames).toContain('tier_loss_consolation_not_capped');
    // tier-boost NOT triggered edge cases
    expect(eloNames).toContain('tier_not_triggered_gap_below_200');
    expect(eloNames).toContain('tier_not_triggered_single_group');

    // absentee deduction at 0/1/2/5+ prior absences
    expect(absenteeNames).toContain('absentee_0_prior');
    expect(absenteeNames).toContain('absentee_1_prior');
    expect(absenteeNames).toContain('absentee_2_prior');
    expect(absenteeNames).toContain('absentee_5_prior');

    // player activation with and without explicit activateScore
    expect(activationNames).toContain('activate_with_explicit_score');
    expect(activationNames.some((n) => n.startsWith('activate_auto_score'))).toBe(true);
  });

  it('every elo scenario captured a persisted score and a parsed breakdown', () => {
    for (const scenario of fixtures.eloScenarios) {
      expect(typeof scenario.output.team1Score).toBe('number');
      expect(typeof scenario.output.team2Score).toBe('number');
      expect(scenario.output.scoreBreakdown).toBeTruthy();
      expect(scenario.output.scoreBreakdown.team1).toBeTruthy();
      expect(scenario.output.scoreBreakdown.team2).toBeTruthy();
    }
  });

  it('base Elo delta is equal and opposite between teams (only the base delta is zero-sum -  '
    + 'tier adjustment and consolation are computed per-team and can break symmetry)', () => {
    for (const scenario of fixtures.eloScenarios) {
      const { team1, team2 } = scenario.output.scoreBreakdown;
      expect(team1.baseElo).toBeCloseTo(-team2.baseElo, 10);
    }
  });

  describe('ported calculateElo reproduces every eloScenarios fixture bit-for-bit', () => {
    for (const scenario of fixtures.eloScenarios) {
      it(scenario.name, () => {
        const result = calculateElo({
          team1AverageRankScore: average(scenario.input.team1PlayerRankScores),
          team2AverageRankScore: average(scenario.input.team2PlayerRankScores),
          team1SetPoints: scenario.input.team1SetPoints,
          team2SetPoints: scenario.input.team2SetPoints,
          groupIndex: scenario.input.groupIndex,
          totalGroups: scenario.input.totalGroups,
          dayWideScoreGapLargeEnough: scenario.input.dayWideScoreGapLargeEnough,
        });

        expect(result.team1Score).toBe(scenario.output.team1Score);
        expect(result.team2Score).toBe(scenario.output.team2Score);
        expect(result.breakdown).toEqual(scenario.output.scoreBreakdown);
      });
    }
  });

  describe('ported decideAbsenteeAction reproduces every absenteeScenarios fixture bit-for-bit', () => {
    for (const scenario of fixtures.absenteeScenarios) {
      it(scenario.name, () => {
        const result = decideAbsenteeAction(scenario.input.priorAbsencesWithinLast5Games);

        if (scenario.output.action === 'deactivated') {
          expect(result).toEqual({ action: 'deactivate' });
          expect(scenario.output.encounterIdUsed).toBe(DISABLE_PLAYER_ENCOUNTER_ID);
        } else {
          expect(result).toEqual({ action: 'demerit', points: scenario.output.pointsApplied });
          expect(scenario.output.encounterIdUsed).toBe(ABSENTEE_ENCOUNTER_ID);
        }
      });
    }
  });

  describe('ported computeActivationScore reproduces every activationScenarios fixture bit-for-bit', () => {
    for (const scenario of fixtures.activationScenarios) {
      it(scenario.name, () => {
        const newScore = computeActivationScore(scenario.input.explicitActivateScore, {
          currentSameRankPlayerScore: scenario.input.currentSameRankPlayerScore,
          currentMinActiveRankScore: scenario.input.currentMinActiveRankScore ?? 0,
        });

        expect(newScore).toBe(scenario.output.rankScoreAfter);
        expect(newScore).toBe(scenario.output['scoreHistory.newRankScore']);
      });
    }
  });
});
