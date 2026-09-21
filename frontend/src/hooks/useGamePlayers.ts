import useSWR from 'swr';
import type { PlayerType } from '@prisma/client';
import type { Player } from '@/types/player';
import { usePlayers } from './usePlayers';
import { useSquad } from '@/contexts/SquadContext';

interface GamePlayerResponse {
  id: number;
  rank: number;
  playerType: PlayerType;
  isActiveReplacement: boolean;
  hasScore: boolean;
}

// OPEN_SLOT_PLAYERS_PLAN.md "Game-planner player selection UI": the day-scoped facts
// (isActiveReplacement, hasScore) that don't belong on the general Player type, merged onto it
// for this one screen.
export interface GamePlannerPlayer extends Player {
  isActiveReplacement: boolean;
  hasScore: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch game players');
  return res.json();
};

export function useGamePlayers() {
  const { id: squadId } = useSquad();
  const { data: eligiblePlayers, error: eligibleError, isLoading: eligibleLoading, mutate: mutateEligible } =
    useSWR<GamePlayerResponse[]>(`/api/squads/${squadId}/game/players`, fetcher);
  const { players: allPlayers, isLoading: playersLoading, mutate: mutateAllPlayers } = usePlayers();

  const players = eligiblePlayers?.map(eligible => {
    const playerDetails = allPlayers.find(p => p.id === eligible.id);
    return playerDetails ? {
      ...playerDetails,
      playerRank: eligible.rank, // Use the rank from game players endpoint
      isActiveReplacement: eligible.isActiveReplacement,
      hasScore: eligible.hasScore,
    } : null;
  }).filter((p): p is GamePlannerPlayer => p !== null) || [];

  // After a bulk-initial-score assignment, both the roster (rankScore/playerRank) and the
  // game-day eligibility list (hasScore/rank) need to be re-fetched before a retry of game
  // creation can see the newly-assigned scores.
  const refresh = async () => {
    await Promise.all([mutateEligible(), mutateAllPlayers()]);
  };

  return {
    players,
    isLoading: eligibleLoading || playersLoading,
    error: eligibleError,
    refresh,
  };
}
