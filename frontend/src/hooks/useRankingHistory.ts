import useSWR from 'swr';
import type { RankingHistoryData } from '@/types/rankings';
import { useSquad } from '@/contexts/SquadContext';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useRankingHistory() {
  const { id: squadId } = useSquad();
  const { data, error, isLoading } = useSWR<RankingHistoryData[]>(
    `/api/squads/${squadId}/rankings/history`,
    fetcher
  );

  return {
    rankingHistory: data || [],
    isLoading,
    error
  };
}
