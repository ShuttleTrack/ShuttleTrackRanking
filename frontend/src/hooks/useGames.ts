import useSWR from 'swr';
import type { Game } from '@prisma/client';
import { useSquad } from '@/contexts/SquadContext';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useGames() {
  const { id: squadId } = useSquad();
  const { data, error, isLoading, mutate } = useSWR<Game[]>(
    `/api/squads/${squadId}/games`,
    fetcher
  );

  return {
    games: data || [],
    isLoading,
    error,
    mutate
  };
}
