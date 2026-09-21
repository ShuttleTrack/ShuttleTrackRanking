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

// The game-day rank comes from the eligibility endpoint, not the roster: it's a fresh sequential
// position over the *ranked* list (getRankedPlayers, nulls last), which is what the planner
// slices into skill tiers. That's why a newly-scored player can't just be patched in locally -
// assigning them a score moves everyone's game-day rank, so the list has to be re-derived from
// a re-fetch. See mergeGamePlayers' use in refresh() below.
function mergeGamePlayers(
  eligiblePlayers: GamePlayerResponse[] | undefined,
  allPlayers: Player[]
): GamePlannerPlayer[] {
  return (
    eligiblePlayers
      ?.map(eligible => {
        const playerDetails = allPlayers.find(p => p.id === eligible.id);
        return playerDetails
          ? {
              ...playerDetails,
              playerRank: eligible.rank, // Use the rank from game players endpoint
              isActiveReplacement: eligible.isActiveReplacement,
              hasScore: eligible.hasScore,
            }
          : null;
      })
      .filter((p): p is GamePlannerPlayer => p !== null) || []
  );
}

export function useGamePlayers() {
  const { id: squadId } = useSquad();
  const { data: eligiblePlayers, error: eligibleError, isLoading: eligibleLoading, mutate: mutateEligible } =
    useSWR<GamePlayerResponse[]>(`/api/squads/${squadId}/game/players`, fetcher);
  const { players: allPlayers, isLoading: playersLoading, mutate: mutateAllPlayers } = usePlayers();

  const players = mergeGamePlayers(eligiblePlayers, allPlayers);

  // After a bulk-initial-score assignment, both the roster (rankScore/playerRank) and the
  // game-day eligibility list (hasScore/rank) need to be re-fetched before game creation can see
  // the newly-assigned scores. Returns the re-derived list rather than just revalidating: the
  // caller continues straight into group creation in the same tick, so it can't wait for the
  // re-render that `players` above would come back on.
  const refresh = async (): Promise<GamePlannerPlayer[]> => {
    const [freshEligible, freshAll] = await Promise.all([mutateEligible(), mutateAllPlayers()]);
    return mergeGamePlayers(freshEligible, freshAll ?? []);
  };

  return {
    players,
    isLoading: eligibleLoading || playersLoading,
    error: eligibleError,
    refresh,
  };
}
