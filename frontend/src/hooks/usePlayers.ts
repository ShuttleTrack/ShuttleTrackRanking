import useSWR from 'swr';
import type { Player } from '@/types/player';
import { useOptionalSquad } from '@/contexts/SquadContext';

const fetcher = (url: string) => fetch(url).then(res => res.json());

// useOptionalSquad rather than useSquad: this is called unconditionally by the global nav
// (player search), which also renders on non-squad-scoped pages (squad picker, login, platform
// admin) where there's simply no roster to search.
export function usePlayers() {
  const squad = useOptionalSquad();
  const { data, error, isLoading, mutate } = useSWR<Player[]>(
    squad ? `/api/squads/${squad.id}/players` : null,
    fetcher
  );

  return {
    players: data || [],
    isLoading,
    error,
    mutate
  };
}
