import useSWR from 'swr';
import { useOptionalSquad } from '@/contexts/SquadContext';
import type { UpcomingGameDay } from '@/lib/check-in/types';

const fetcher = async (url: string): Promise<UpcomingGameDay[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load upcoming game days');
  return res.json();
};

// GET /api/squads/[squadId]/game-days - sessions that have not ended yet, with the caller's own
// state on each. Feeds the profile page's list and the Check-in tab. `enabled` lets the tab bar
// skip the request on pages where it is not shown.
export function useUpcomingGameDays(enabled = true) {
  const squad = useOptionalSquad();
  const key = enabled && squad ? `/api/squads/${squad.id}/game-days` : null;
  const { data, error, isLoading } = useSWR<UpcomingGameDay[]>(key, fetcher, { refreshInterval: 5 * 60_000 });
  return { gameDays: data ?? [], error, isLoading };
}
