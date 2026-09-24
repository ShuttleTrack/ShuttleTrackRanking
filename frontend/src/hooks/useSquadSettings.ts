import useSWR from 'swr';
import type { DayOfWeek } from '@/lib/squadSchedule';
import { useSquad } from '@/contexts/SquadContext';

export interface SquadSettings {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  // maxPlayers caps the FULLTIME roster only (SELF_REGISTRATION_PLAN.md) - compare
  // fulltimePlayerCount against it, not playerCount, which is the whole roster.
  maxPlayers: number | null;
  playerCount: number;
  fulltimePlayerCount: number;
  pendingJoinRequestCount: number;
  isPublic: boolean;
  openForOpenSlot: boolean;
  isRecurring: boolean;
  scheduleDayOfWeek: DayOfWeek | null;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  scheduleSkipDates: string[] | null;
  scheduleTimezone: string;
  openSlotAbsenteeGraceDays: number;
  openSlotVisibilityGameDays: number;
  // Squad.gameDayOps, unpacked (lib/gameDayOps.ts's gameDayOpsToWire).
  gameDayOpsEnabled: boolean;
  gameDayVoteOpensDaysBefore: number;
  gameDayMinPlayersForOpenSlot: number | null;
  gameDayTelegramMainChatId: string | null;
  gameDayTelegramOpenSlotChatId: string | null;
  // Admin Telegram group for pending actions and roster updates (lib/adminNotifications.ts).
  adminTelegramChatId: string | null;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// enabled/maxPlayers are read-only for a squad admin (only a platform superadmin can change
// them - see pages/api/squads/[squadId]/index.ts and platform/squads.tsx). isPublic, the
// schedule fields, and the open-slot settings (including openForOpenSlot) ARE editable by a
// squad's own admins - see pages/api/squads/[squadId]/{visibility,schedule,open-slot-settings,game-day-ops,admin-telegram}.ts.
export function useSquadSettings() {
  const { id: squadId } = useSquad();
  const { data, error, isLoading, mutate } = useSWR<SquadSettings>(`/api/squads/${squadId}`, fetcher);

  return { settings: data, isLoading, error, mutate };
}
