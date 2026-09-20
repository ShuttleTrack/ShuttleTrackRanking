import useSWR from 'swr';
import { useSquad } from '@/contexts/SquadContext';

export interface SquadSettings {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  maxPlayers: number | null;
  playerCount: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Read-only for a squad admin (any squad admin can see enabled/maxPlayers, only a platform
// superadmin can change them - see pages/api/squads/[squadId]/index.ts and platform/squads.tsx).
export function useSquadSettings() {
  const { id: squadId } = useSquad();
  const { data, error, isLoading } = useSWR<SquadSettings>(`/api/squads/${squadId}`, fetcher);

  return { settings: data, isLoading, error };
}
