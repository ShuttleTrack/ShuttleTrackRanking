import { describe, it, expect } from 'vitest';
import {
  absenteeMultiplierForSpell,
  decideOpenSlotAbsenteeAction,
  decideActiveReplacementAbsenteeAction,
  decideAbsenteeAction,
  DEMERIT_POINTS_ABSENTEE,
} from './absenteeManager';

describe('absenteeMultiplierForSpell (OPEN_SLOT_PLAYERS_PLAN.md day-based ramp)', () => {
  it('1x at 1 missed game day', () => {
    expect(absenteeMultiplierForSpell(1)).toBe(1);
  });
  it('2x at 2 missed game days', () => {
    expect(absenteeMultiplierForSpell(2)).toBe(2);
  });
  it('3x at 3 or more missed game days', () => {
    expect(absenteeMultiplierForSpell(3)).toBe(3);
    expect(absenteeMultiplierForSpell(10)).toBe(3);
  });
  it('produces the same amounts as the legacy ladder\'s first three steps', () => {
    for (const [spellDays, priorAbsences] of [
      [1, 0],
      [2, 1],
      [3, 2],
    ] as const) {
      const legacy = decideAbsenteeAction(priorAbsences);
      expect(legacy.action).toBe('demerit');
      expect(absenteeMultiplierForSpell(spellDays) * DEMERIT_POINTS_ABSENTEE).toBe(
        legacy.action === 'demerit' ? legacy.points : NaN
      );
    }
  });
});

describe('decideOpenSlotAbsenteeAction (Path 3: plain open-slot, rolling grace window)', () => {
  const graceDays = 3;

  it('demerits while within the grace window, on the day-based ramp', () => {
    expect(decideOpenSlotAbsenteeAction(1, graceDays)).toEqual({ action: 'demerit', points: -10 });
    expect(decideOpenSlotAbsenteeAction(2, graceDays)).toEqual({ action: 'demerit', points: -20 });
    expect(decideOpenSlotAbsenteeAction(3, graceDays)).toEqual({ action: 'demerit', points: -30 });
  });

  it('skips once spellDays exceeds graceDays - never deactivates', () => {
    expect(decideOpenSlotAbsenteeAction(4, graceDays)).toEqual({ action: 'skip' });
    expect(decideOpenSlotAbsenteeAction(100, graceDays)).toEqual({ action: 'skip' });
  });

  it('is a rolling exemption, not a step function on an absolute day count - grace is relative to the caller-supplied spellDays', () => {
    // spellDays itself resets whenever the player plays again (a caller concern, exercised via
    // absenteeSpell.ts) - this function only ever sees the *current* spell length.
    expect(decideOpenSlotAbsenteeAction(1, 0)).toEqual({ action: 'skip' });
  });
});

describe('decideActiveReplacementAbsenteeAction (Path 2: active replacement window, no cutoff)', () => {
  it('ramps -10/-20/-30 exactly like Path 3 for the first three missed days', () => {
    expect(decideActiveReplacementAbsenteeAction(1)).toEqual({ action: 'demerit', points: -10 });
    expect(decideActiveReplacementAbsenteeAction(2)).toEqual({ action: 'demerit', points: -20 });
    expect(decideActiveReplacementAbsenteeAction(3)).toEqual({ action: 'demerit', points: -30 });
  });

  it('never tapers off or skips, however long the spell', () => {
    expect(decideActiveReplacementAbsenteeAction(6)).toEqual({ action: 'demerit', points: -30 });
    expect(decideActiveReplacementAbsenteeAction(30)).toEqual({ action: 'demerit', points: -30 });
  });
});
