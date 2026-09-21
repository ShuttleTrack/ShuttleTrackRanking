import useSWR from 'swr';
import type { Encounter } from '@/types/encounter';
import { useSquad } from '@/contexts/SquadContext';

interface EncountersResponse {
  stats: {
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  encountersByDate: Record<string, Encounter[]>;
  scoreSumByDate: Record<string, number>;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function usePlayerEncounters(playerId: string | string[] | undefined) {
  const { id: squadId } = useSquad();
  const { data, error, isLoading } = useSWR<EncountersResponse>(
    playerId ? `/api/squads/${squadId}/players/${playerId}/encounters` : null,
    fetcher
  );

  return {
    encounters: data,
    isLoading,
    error
  };
}
