import useSWR from 'swr';
import type { RankingsResponse } from '@/types/rankings';
import { useSquad } from '@/contexts/SquadContext';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useRankings() {
  const { id: squadId } = useSquad();
  const { data, error, isLoading } = useSWR<RankingsResponse>(
    `/api/squads/${squadId}/rankings`,
    fetcher
  );

  return {
    rankings: data,
    isLoading,
    error
  };
}
