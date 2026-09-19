// Ported from backend core/CommonAbsenteeManager.java (MIGRATION_PLAN.md Phase 3 / §5).

export const DEMERIT_POINTS_ABSENTEE = -10; // backend common/Constants.java - see MIGRATION_PLAN.md Phase 0's K note for the history of this value.
export const ABSENTEE_ENCOUNTER_ID = -1;
export const DISABLE_PLAYER_ENCOUNTER_ID = -2;
export const ACTIVATE_PLAYER_ENCOUNTER_ID = -3;

export type AbsenteeAction = { action: 'demerit'; points: number } | { action: 'deactivate' };

// CommonAbsenteeManager.countAbsentTimes: counts entries with encounterId === ABSENTEE_ENCOUNTER_ID
// among the *first 5* rows of a player's score history ordered newest-first.
export function countAbsentTimes(recentScoreHistoryEncounterIds: number[]): number {
  return recentScoreHistoryEncounterIds.slice(0, 5).filter((id) => id === ABSENTEE_ENCOUNTER_ID).length;
}

// CommonAbsenteeManager.calculateAbsenteeScoreAndPersist (per-player decision only - the
// persistence/deactivation side effects are in scorePersister.ts). >= 5 -> long-term
// auto-deactivation. Otherwise an escalating demerit multiplier: 1x / 2x / 3x for 0 / 1 / 2+
// prior absences within the last 5 games.
export function decideAbsenteeAction(priorAbsencesInLast5: number): AbsenteeAction {
  if (priorAbsencesInLast5 >= 5) {
    return { action: 'deactivate' };
  }
  const multiplier = priorAbsencesInLast5 === 0 ? 1 : priorAbsencesInLast5 === 1 ? 2 : 3;
  return { action: 'demerit', points: multiplier * DEMERIT_POINTS_ABSENTEE };
}
