import { round2 } from './round';

// Ported from backend core/EloRankScoreCalculator.java (MIGRATION_PLAN.md Phase 3 / §5). This
// is the pure math only - team average rank scores and the day-wide "is the score gap large
// enough to trigger tiering" boolean are computed by the caller (they need DB access; see
// EloRankScoreCalculator.isScoreGapLargeEnough for what that boolean means and how it's
// derived). Validated bit-for-bit against the real backend's captured output in
// characterization.test.ts (MIGRATION_PLAN.md Phase 0).

const K = 20;
const WIN_BOOST = 0.5;
const LOSS_SHIELD = 0.5;
const CONSOLATION_CAP = 2;
const CONSOLATION_MAX_SET_POINTS = 20;

export interface TeamScoreBreakdown {
  baseElo: number;
  tierAdjustment: number;
  consolation: number;
  finalScore: number;
}

export interface ScoreBreakdown {
  team1: TeamScoreBreakdown;
  team2: TeamScoreBreakdown;
  groupIndex: number;
  totalGroups: number;
  tierFactor: number;
  scoreGapTriggered: boolean;
}

export interface EloCalcInput {
  team1AverageRankScore: number;
  team2AverageRankScore: number;
  team1SetPoints: number;
  team2SetPoints: number;
  groupIndex: number | null;
  totalGroups: number | null;
  // EloRankScoreCalculator.isScoreGapLargeEnough(encounterDate): whether the day's participants
  // span a rankScore gap >= TIER_BOOST_MIN_SCORE_GAP (200). Only consulted when
  // totalGroups > 1 - irrelevant (and safe to pass `false`) otherwise, since the tier factor
  // short-circuits to 0 on totalGroups <= 1 before this is ever checked.
  dayWideScoreGapLargeEnough: boolean;
}

export interface EloCalcResult {
  team1Score: number;
  team2Score: number;
  breakdown: ScoreBreakdown;
}

function getTierFactor(input: EloCalcInput): number {
  if (input.groupIndex === null || input.totalGroups === null || input.totalGroups <= 1) {
    return 0;
  }
  if (!input.dayWideScoreGapLargeEnough) {
    return 0;
  }
  return (input.groupIndex - 1) / (input.totalGroups - 1);
}

function applyTierMultiplier(score: number, tierFactor: number): number {
  const multiplier = score > 0 ? 1 + tierFactor * WIN_BOOST : 1 - tierFactor * LOSS_SHIELD;
  return round2(score * multiplier);
}

function calculateConsolation(absLoss: number, loserSetPoints: number): number {
  const maxBonus = Math.min(CONSOLATION_CAP, absLoss);
  const ratio = Math.min(loserSetPoints, CONSOLATION_MAX_SET_POINTS) / CONSOLATION_MAX_SET_POINTS;
  return round2(maxBonus * ratio);
}

export function calculateElo(input: EloCalcInput): EloCalcResult {
  const team1WinExpected =
    1 / (1 + Math.pow(10, (input.team2AverageRankScore - input.team1AverageRankScore) / 480));
  const team1WinActual = input.team1SetPoints > input.team2SetPoints ? 1 : 0;

  const team1BaseElo = round2(K * (team1WinActual - team1WinExpected));
  const team2BaseElo = -1 * team1BaseElo;

  const tierFactor = getTierFactor(input);
  const scoreGapTriggered = tierFactor > 0;

  let team1TierAdj = 0;
  let team2TierAdj = 0;
  let team1Consolation = 0;
  let team2Consolation = 0;

  if (scoreGapTriggered) {
    team1TierAdj = round2(applyTierMultiplier(team1BaseElo, tierFactor) - team1BaseElo);
    team2TierAdj = round2(applyTierMultiplier(team2BaseElo, tierFactor) - team2BaseElo);

    const team1AfterTier = team1BaseElo + team1TierAdj;
    const team2AfterTier = team2BaseElo + team2TierAdj;

    const team1Lost = team1WinActual === 0;
    if (team1Lost) {
      team1Consolation = round2(calculateConsolation(Math.abs(team1AfterTier), input.team1SetPoints));
    } else {
      team2Consolation = round2(calculateConsolation(Math.abs(team2AfterTier), input.team2SetPoints));
    }
  }

  const team1Final = round2(team1BaseElo + team1TierAdj + team1Consolation);
  const team2Final = round2(team2BaseElo + team2TierAdj + team2Consolation);

  const groupIndex = input.groupIndex ?? 0;
  const totalGroups = input.totalGroups ?? 0;

  return {
    team1Score: team1Final,
    team2Score: team2Final,
    breakdown: {
      team1: { baseElo: team1BaseElo, tierAdjustment: team1TierAdj, consolation: team1Consolation, finalScore: team1Final },
      team2: { baseElo: team2BaseElo, tierAdjustment: team2TierAdj, consolation: team2Consolation, finalScore: team2Final },
      groupIndex,
      totalGroups,
      tierFactor,
      scoreGapTriggered,
    },
  };
}
