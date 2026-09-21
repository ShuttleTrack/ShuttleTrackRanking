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

// Open-slot / replacement players (OPEN_SLOT_PLAYERS_PLAN.md): a separate, day-based escalation
// used instead of decideAbsenteeAction's row-based one, so the legacy fulltime ladder above stays
// completely untouched. Same familiar -10/-20/-30 amounts, 1x at 1 missed game day, 2x at 2, 3x
// at 3 or more - but the caller decides whether/when to stop calling this (grace cutoff for plain
// open-slot, no cutoff for an active replacement window); this function never says "deactivate".
export function absenteeMultiplierForSpell(spellDays: number): number {
  if (spellDays <= 1) return 1;
  if (spellDays === 2) return 2;
  return 3;
}

export type OpenSlotAbsenteeAction = { action: 'demerit'; points: number } | { action: 'skip' };

// Path 3 (OPEN_SLOT_PLAYERS_PLAN.md): a plain open-slot player with no active replacement. A
// rolling grace window, day-based rather than row-based, and never deactivates - once spellDays
// exceeds graceDays the sweep skips them entirely (no ScoreHistory row) until they play again.
export function decideOpenSlotAbsenteeAction(spellDays: number, graceDays: number): OpenSlotAbsenteeAction {
  if (spellDays > graceDays) return { action: 'skip' };
  return { action: 'demerit', points: absenteeMultiplierForSpell(spellDays) * DEMERIT_POINTS_ABSENTEE };
}

// Path 2 (OPEN_SLOT_PLAYERS_PLAN.md): an open-slot player currently filling an active
// SlotReplacement. Same escalation, but no cutoff and never deactivates - having claimed a
// guaranteed slot, the cost of not using it doesn't taper off. The caller is responsible for
// clamping spellDays to the window's startDate (absenteeSpell.ts's `notBefore` parameter) before
// calling this, so a dormancy spell from before the window can't pre-load the ramp.
export function decideActiveReplacementAbsenteeAction(spellDays: number): { action: 'demerit'; points: number } {
  return { action: 'demerit', points: absenteeMultiplierForSpell(spellDays) * DEMERIT_POINTS_ABSENTEE };
}
