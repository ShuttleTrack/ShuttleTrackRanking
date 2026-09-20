import useSWR from 'swr';
import type { GameWithMatches } from '@/types/game';
import { useSquad } from '@/contexts/SquadContext';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useMyMatches() {
  const { id: squadId } = useSquad();
  const { data, error, isLoading, mutate } = useSWR<GameWithMatches[]>(
    `/api/squads/${squadId}/games/my-matches`,
    fetcher
  );

  return {
    games: data || [],
    isLoading,
    error,
    mutate
  };
}
