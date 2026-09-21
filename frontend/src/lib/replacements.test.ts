import { describe, it, expect } from 'vitest';
import { createSlotReplacement } from './replacements';

// These two guards run before any database access (see the top of createSlotReplacement), so
// they're safe to exercise without a live/mocked Prisma client - everything past them (ownership,
// playerType checks, schedule validation, overlap) needs real data and isn't covered here; see
// this repo's existing convention (scorePersister.ts et al.) of only unit-testing pure logic.
describe('createSlotReplacement input guards (no DB access reached)', () => {
  it('rejects a player nominating themselves', async () => {
    await expect(
      createSlotReplacement(1, {
        fulltimePlayerId: 5,
        replacementPlayerId: 5,
        startDate: '2026-01-01',
        endDate: '2026-01-08',
        createdByEmail: 'owner@example.com',
      })
    ).rejects.toThrow('cannot replace themselves');
  });

  it('rejects an end date before the start date', async () => {
    await expect(
      createSlotReplacement(1, {
        fulltimePlayerId: 5,
        replacementPlayerId: 6,
        startDate: '2026-01-08',
        endDate: '2026-01-01',
        createdByEmail: 'owner@example.com',
      })
    ).rejects.toThrow('End date must be on or after the start date');
  });
});
