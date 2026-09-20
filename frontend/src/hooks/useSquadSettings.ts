import useSWR from 'swr';
import type { DayOfWeek } from '@prisma/client';
import { useSquad } from '@/contexts/SquadContext';

export interface SquadSettings {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  maxPlayers: number | null;
  playerCount: number;
  isPublic: boolean;
  isRecurring: boolean;
  scheduleDayOfWeek: DayOfWeek | null;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  scheduleSkipDates: string[] | null;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// enabled/maxPlayers are read-only for a squad admin (only a platform superadmin can change
// them - see pages/api/squads/[squadId]/index.ts and platform/squads.tsx). isPublic and the
// schedule fields ARE editable by a squad's own admins - see
// pages/api/squads/[squadId]/{visibility,schedule}.ts.
export function useSquadSettings() {
  const { id: squadId } = useSquad();
  const { data, error, isLoading, mutate } = useSWR<SquadSettings>(`/api/squads/${squadId}`, fetcher);

  return { settings: data, isLoading, error, mutate };
}
