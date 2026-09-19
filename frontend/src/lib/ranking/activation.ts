import { DEMERIT_POINTS_ABSENTEE } from './absenteeManager';

// Ported from backend core/ScorePersister.java#activatePlayer (MIGRATION_PLAN.md Phase 3 / §5).
// Pure decision logic only; the DB reads that produce these inputs (last active game's
// playerNewRank, whether an active player currently holds that rank, the current minimum active
// rankScore) live in scorePersister.ts.

export interface AutoActivationScoreInput {
  // rankAtLastActiveGame's currently-active occupant's rankScore, if any (ScorePersister:
  // `currentSameRankPlayer`) - null if no active player currently holds that rank.
  currentSameRankPlayerScore: number | null;
  // Fallback (ScorePersister: `currentMinMarks`) - min rankScore among currently active players.
  currentMinActiveRankScore: number;
}

// ScorePersister.activatePlayer's no-explicit-score branch:
//   newScore = (currentSameRankPlayer present ? their rankScore : currentMinMarks) - (DEMERIT_POINTS_ABSENTEE * 3)
export function computeAutoActivationScore(input: AutoActivationScoreInput): number {
  const base = input.currentSameRankPlayerScore ?? input.currentMinActiveRankScore;
  return base - DEMERIT_POINTS_ABSENTEE * 3;
}

// Top-level branch: an explicit score always wins.
export function computeActivationScore(
  explicitScore: number | null,
  autoInput: AutoActivationScoreInput
): number {
  return explicitScore !== null ? explicitScore : computeAutoActivationScore(autoInput);
}
