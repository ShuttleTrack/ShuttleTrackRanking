import useSWR from 'swr';
import type { Player } from '@/types/player';
import { useSquad } from '@/contexts/SquadContext';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useInactivePlayers() {
  const { id: squadId } = useSquad();
  const { data, error, isLoading, mutate } = useSWR<Player[]>(
    `/api/squads/${squadId}/players/inactive`,
    fetcher
  );

  return {
    inactivePlayers: data || [],
    isLoading,
    error,
    mutate
  };
}
