import useSWR from 'swr';
import type { Player } from '@/types/player';
import { useSquad } from '@/contexts/SquadContext';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch players');
  return res.json();
};

export function useAdminPlayers(status: 'active' | 'inactive') {
  const { id: squadId } = useSquad();
  const { data, error, isLoading, mutate } = useSWR<Player[]>(
    `/api/squads/${squadId}/admin/players?status=${status}`,
    fetcher
  );

  // if the status is active, set isActive to true in all players
  const players = data?.map((player) => ({
    ...player,
    active: status === 'active'
  }));

  return {
    players: players || [],
    isLoading,
    error,
    mutate
  };
}
