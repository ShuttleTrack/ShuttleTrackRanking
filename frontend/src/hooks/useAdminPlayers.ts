import useSWR from 'swr';
import type { Player } from '@/types/player';
import { useSquad } from '@/contexts/SquadContext';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch players');
  return res.json();
};

// 'enabled' is the roster's third bucket: players who are neither ACTIVE nor DISABLED - i.e. on
// the roster but yet to play their first game, which is where every newly added player starts
// (addPlayer leaves playerStatus null) and where a scoreless open-slot player sits indefinitely.
// Without it those rows appear in no admin list at all, since 'active' filters to ACTIVE and
// 'inactive' filters to DISABLED (see lib/ranking/playerStatus.ts's filterPlayersByStatusParam).
export function useAdminPlayers(status: 'active' | 'inactive' | 'enabled') {
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
