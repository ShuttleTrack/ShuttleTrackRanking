import { describe, it, expect } from 'vitest';
import { computeGameDayCounts } from './counts';

type V = { playerId: number; choice: 'IN' | 'OUT' | null; inheritedFromPlayerId: number | null };

// Structural holders 1..3, assigned open-slot player 10.
function counts(votes: V[], { assigned = [10], minPlayers = 5 as number | null } = {}) {
  const structuralHolderIds = new Set([1, 2, 3]);
  const assignedIds = new Set(assigned);
  return computeGameDayCounts({
    structuralHolderIds,
    assignedIds,
    voterIds: new Set([...Array.from(structuralHolderIds), ...assigned]),
    votes: votes as never,
    gameDay: { minPlayers },
  });
}

const own = (playerId: number, choice: 'IN' | 'OUT'): V => ({ playerId, choice, inheritedFromPlayerId: null });

describe('slotsHeld vs confirmedIn - an assigned open slot', () => {
  it('not voted yet: holds a slot, is not confirmed', () => {
    const c = counts([own(1, 'IN')]);
    expect(c).toMatchObject({ slotsHeld: 2, confirmedIn: 1, unconfirmedAssigneeIds: [10] });
  });

  it('votes IN: in both, and NOT double-counted', () => {
    const c = counts([own(1, 'IN'), own(10, 'IN')]);
    expect(c).toMatchObject({ slotsHeld: 2, confirmedIn: 2, unconfirmedAssigneeIds: [] });
  });

  it('votes OUT: in neither (castVote also withdraws the entry, so it stops being assigned)', () => {
    const c = counts([own(1, 'IN'), own(10, 'OUT')], { assigned: [] });
    expect(c).toMatchObject({ slotsHeld: 1, confirmedIn: 1 });
  });
});

describe('slotsHeld vs confirmedIn - an inherited reservation', () => {
  it('holds the slot but is not a confirmation', () => {
    const c = counts([own(1, 'IN'), { playerId: 2, choice: 'IN', inheritedFromPlayerId: 99 }], { assigned: [] });
    expect(c).toMatchObject({ slotsHeld: 2, confirmedIn: 1, inheritedReservationIds: [2] });
  });

  it('their own IN clears the stamp and moves them into confirmedIn without changing slotsHeld', () => {
    const before = counts([own(1, 'IN'), { playerId: 2, choice: 'IN', inheritedFromPlayerId: 99 }], { assigned: [] });
    const after = counts([own(1, 'IN'), own(2, 'IN')], { assigned: [] });
    expect(after.slotsHeld).toBe(before.slotsHeld);
    expect(after.confirmedIn).toBe(before.confirmedIn + 1);
    expect(after.inheritedReservationIds).toEqual([]);
  });

  it('their OUT drops the reservation', () => {
    const c = counts([own(1, 'IN'), own(2, 'OUT')], { assigned: [] });
    expect(c).toMatchObject({ slotsHeld: 1, confirmedIn: 1 });
  });

  it('a choice-less inherited row (a slot gained from someone who was out) counts nowhere', () => {
    const c = counts([own(1, 'IN'), { playerId: 2, choice: null, inheritedFromPlayerId: 99 }], { assigned: [] });
    expect(c).toMatchObject({ slotsHeld: 1, confirmedIn: 1 });
  });
});

describe('vacancies', () => {
  it('is the floor-zero gap between the minimum and slotsHeld, or null with no minimum', () => {
    expect(counts([own(1, 'IN')]).vacancies).toBe(3);
    expect(counts([own(1, 'IN'), own(2, 'IN'), own(3, 'IN')], { minPlayers: 2 }).vacancies).toBe(0);
    expect(counts([], { minPlayers: null }).vacancies).toBeNull();
  });

  it('ignores a vote row left by someone who is no longer a voter', () => {
    const c = counts([own(1, 'IN'), own(42, 'IN')]);
    expect(c).toMatchObject({ slotsHeld: 2, confirmedIn: 1 });
  });
});
