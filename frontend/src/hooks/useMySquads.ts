import useSWR from 'swr';
import { useSession } from 'next-auth/react';

export interface MySquadOption {
  id: number;
  name: string;
  slug: string;
}

const fetcher = async (url: string): Promise<MySquadOption[]> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch squads');
  }
  return res.json();
};

export function useMySquads() {
  const { status } = useSession();
  const { data, error, isLoading } = useSWR<MySquadOption[]>(
    status === 'authenticated' ? '/api/squads' : null,
    fetcher
  );

  return {
    squads: data ?? [],
    isLoading: status === 'loading' || isLoading,
    error,
  };
}
