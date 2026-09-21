import useSWR from 'swr';
import type { Encounter } from '@/types/encounter';
import { buildEncounterHistoryUrl, type EncounterTeamQuery } from '@/utils/encounterHistory';
import { useSquad } from '@/contexts/SquadContext';

async function encounterHistoryFetcher(url: string): Promise<Encounter[]> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (!Array.isArray(body)) {
    throw new Error('Invalid encounter history response');
  }
  return body as Encounter[];
}

export function useEncounterHistory(slots: EncounterTeamQuery, enabled: boolean) {
  const { id: squadId } = useSquad();
  const key = enabled ? buildEncounterHistoryUrl(squadId, slots) : null;

  const { data, error, isLoading } = useSWR<Encounter[]>(key, encounterHistoryFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  return {
    encounters: key ? data : undefined,
    isLoading: Boolean(key) && isLoading,
    error,
  };
}
