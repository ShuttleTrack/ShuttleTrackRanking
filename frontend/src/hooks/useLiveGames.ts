import useSWR from 'swr';
import { useOptionalSquad } from '@/contexts/SquadContext';

export interface LiveGame {
  id: string;
  progress: number;
  createdAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch live games');
  return res.json();
};

export function useLiveGames(refreshInterval = 30000) {
  // Nav-shared hook: renders on non-squad-scoped pages too (squad picker, login, platform
  // admin), where there's simply nothing to show.
  const squad = useOptionalSquad();
  const { data, error, isLoading } = useSWR<LiveGame[]>(
    squad ? `/api/squads/${squad.id}/games/in-progress` : null,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      revalidateOnReconnect: true
    }
  );

  return {
    liveGames: data || [],
    isLoading,
    isError: error
  };
}
