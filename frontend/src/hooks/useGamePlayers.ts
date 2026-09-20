import useSWR from 'swr';
import type { Player } from '@/types/player';
import { usePlayers } from './usePlayers';
import { useSquad } from '@/contexts/SquadContext';

interface GamePlayerResponse {
  id: number;
  rank: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch game players');
  return res.json();
};

export function useGamePlayers() {
  const { id: squadId } = useSquad();
  const { data: eligiblePlayers, error: eligibleError, isLoading: eligibleLoading } =
    useSWR<GamePlayerResponse[]>(`/api/squads/${squadId}/game/players`, fetcher);
  const { players: allPlayers, isLoading: playersLoading } = usePlayers();

  const players = eligiblePlayers?.map(eligible => {
    const playerDetails = allPlayers.find(p => p.id === eligible.id);
    return playerDetails ? {
      ...playerDetails,
      playerRank: eligible.rank // Use the rank from game players endpoint
    } : null;
  }).filter((p): p is Player => p !== null) || [];

  return {
    players,
    isLoading: eligibleLoading || playersLoading,
    error: eligibleError
  };
}
