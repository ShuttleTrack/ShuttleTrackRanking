import useSWR from 'swr';
import { useSquad } from '@/contexts/SquadContext';
import { useUpcomingGameDays } from '@/hooks/useUpcomingGameDays';
import type { GameDayAttendance } from '@/lib/check-in/types';

const fetcher = async (url: string): Promise<GameDayAttendance> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load attendance');
  return res.json();
};

// Today's game day for Game Planner, once its voting has closed - the only point at which the
// planner seeds from it (before 13:00 attendance is not frozen). Null when the squad does not run
// check-in, has no session today, or voting is still open.
export function useTodaysAttendance(enabled: boolean) {
  const { id: squadId } = useSquad();
  const { gameDays, isLoading: listLoading } = useUpcomingGameDays(enabled);
  const today = gameDays.find((g) => g.isToday && g.status === 'VOTING_CLOSED');
  const key = enabled && today ? `/api/squads/${squadId}/game-days/${today.gameDate}/admin` : null;
  const { data, isLoading, mutate } = useSWR<GameDayAttendance>(key, fetcher);

  const releaseSlot = async (playerId: number) => {
    if (!key) return;
    const res = await fetch(key, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'release', playerId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Failed to release the slot');
    }
    await mutate(await res.json(), { revalidate: false });
  };

  return {
    attendance: data ?? null,
    isLoading: enabled && (listLoading || (key !== null && isLoading)),
    releaseSlot,
  };
}
