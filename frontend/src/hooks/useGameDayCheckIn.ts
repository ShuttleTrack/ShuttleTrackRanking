import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlayers } from '@/hooks/usePlayers';
import { buildCheckInRoster } from '@/lib/check-in/mockVotes';
import { parseGameDayId } from '@/lib/check-in/schedule';
import { readStoredVote, writeStoredVote } from '@/lib/check-in/storage';
import type { CheckInState, CheckInVote } from '@/lib/check-in/types';

export function useGameDayCheckIn(uid: string | undefined, playerId: number | undefined) {
  const { players, isLoading: playersLoading, error: playersError } = usePlayers();
  const [myVote, setMyVote] = useState<CheckInVote | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const gameDay = useMemo(() => (uid ? parseGameDayId(uid) : null), [uid]);

  useEffect(() => {
    if (!uid || playerId === undefined) {
      setMyVote(null);
      setHydrated(true);
      return;
    }
    setMyVote(readStoredVote(uid, playerId));
    setHydrated(true);
  }, [uid, playerId]);

  const castVote = useCallback(
    (vote: CheckInVote) => {
      if (!uid || playerId === undefined) return;
      writeStoredVote(uid, playerId, vote);
      setMyVote(vote);
    },
    [uid, playerId]
  );

  const roster = useMemo(
    () => buildCheckInRoster(players, uid ?? '', playerId, myVote),
    [players, uid, playerId, myVote]
  );

  const data: CheckInState | null = useMemo(() => {
    if (!gameDay) return null;
    return {
      gameDay,
      myVote,
      inPlayers: roster.inPlayers,
      outPlayers: roster.outPlayers,
    };
  }, [gameDay, myVote, roster.inPlayers, roster.outPlayers]);

  const isLoading = playersLoading || !hydrated;
  const error = playersError;

  return { data, isLoading, error, castVote, notFound: Boolean(uid && hydrated && !gameDay) };
}
