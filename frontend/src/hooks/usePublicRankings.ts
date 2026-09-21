import useSWR from 'swr';
import type { PublicRankingsResponse } from '@/types/rankings';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function usePublicRankings() {
  const { data, error, isLoading } = useSWR<PublicRankingsResponse>('/api/rankings', fetcher);
  return { rankings: data, isLoading, error };
}
