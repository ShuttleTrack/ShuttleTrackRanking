import { describe, it, expect } from 'vitest';
import { dailyGroupSeed } from './groupSeed';

const TZ = 'Europe/Amsterdam';

describe('dailyGroupSeed', () => {
  it('returns the same seed for a squad all day', () => {
    const morning = dailyGroupSeed(1, TZ, new Date('2026-06-04T07:00:00Z'));
    const evening = dailyGroupSeed(1, TZ, new Date('2026-06-04T20:00:00Z'));
    expect(evening).toBe(morning);
  });

  it('issues a fresh seed the next squad-local day', () => {
    const today = dailyGroupSeed(2, TZ, new Date('2026-06-04T12:00:00Z'));
    // 22:30 UTC is already 00:30 the next day in Amsterdam.
    const tomorrow = dailyGroupSeed(2, TZ, new Date('2026-06-04T22:30:00Z'));
    expect(tomorrow).not.toBe(today);
  });

  it('keeps squads independent', () => {
    const now = new Date('2026-06-05T12:00:00Z');
    expect(dailyGroupSeed(3, TZ, now)).not.toBe(dailyGroupSeed(4, TZ, now));
  });
});
