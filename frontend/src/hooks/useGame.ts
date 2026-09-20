import useSWR from 'swr';
import type { Game } from '@prisma/client';
import { useSquad } from '@/contexts/SquadContext';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useGame(id: string | undefined) {
  const { id: squadId } = useSquad();
  const { data, error, isLoading, mutate } = useSWR<Game>(
    id ? `/api/squads/${squadId}/games/${id}` : null,
    fetcher
  );

  return {
    game: data,
    isLoading,
    error,
    mutate
  };
}
