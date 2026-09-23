import useSWR from 'swr';

export interface PublicLiveGame {
  id: string;
  progress: number;
  createdAt: string;
  squad: { slug: string; name: string };
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch live games');
  return res.json();
};

// Site-root counterpart of useLiveGames: live games across every public squad, no squad context.
export function usePublicLiveGames(refreshInterval = 30000) {
  const { data, error, isLoading } = useSWR<PublicLiveGame[]>('/api/games/live', fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  return {
    liveGames: data || [],
    isLoading,
    isError: error,
  };
}
