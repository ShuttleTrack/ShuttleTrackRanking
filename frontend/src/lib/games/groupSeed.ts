import { randomBytes } from 'crypto';
import { localDateIso } from '@/lib/gameDay/clock';

// The random seed that orders a game day's 4/5-player group sizes (calculateGroupDistribution in
// the game planner). Generated on the first request of a squad-local day and reused for the rest
// of that day, so re-creating a game can't re-roll for a more favourable grouping; the next day
// gets a fresh one. In-process memory only - this deploys as one long-running container, and a
// restart handing out a new seed is acceptable.
const seeds = new Map<string, string>();

export function dailyGroupSeed(squadId: number, timezone: string, now: Date = new Date()): string {
  const today = localDateIso(now, timezone);
  const key = `${squadId}:${today}`;
  let seed = seeds.get(key);
  if (!seed) {
    // Only today's entries are ever read again; drop earlier days so the map can't grow.
    seeds.forEach((_, existing) => {
      if (!existing.endsWith(`:${today}`)) seeds.delete(existing);
    });
    seed = randomBytes(16).toString('hex');
    seeds.set(key, seed);
  }
  return seed;
}
