import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useSquad } from '@/contexts/SquadContext';
import type { CheckInVote, GameDayView } from '@/lib/check-in/types';

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const fetcher = async (url: string): Promise<GameDayView> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new HttpError(body.message ?? 'Failed to load the game day', res.status);
  }
  return res.json();
};

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message ?? 'Something went wrong');
  }
}

// One game day's check-in, from GET /api/squads/[squadId]/game-days/[date], with the write
// actions beside it. Every action revalidates afterwards: the server decides what the vote did
// (promotions, withdrawals), so the page always re-reads rather than guessing.
export function useGameDayCheckIn(date: string | undefined) {
  const { id: squadId } = useSquad();
  const base = date ? `/api/squads/${squadId}/game-days/${date}` : null;
  const { data, error, isLoading, mutate } = useSWR<GameDayView>(base, fetcher, { refreshInterval: 60_000 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (action: () => Promise<void>, optimistic?: (view: GameDayView) => GameDayView) => {
      if (!base) return;
      setActionError(null);
      setPending(true);
      try {
        if (optimistic && data) {
          await mutate(
            async () => {
              await action();
              return undefined;
            },
            { optimisticData: optimistic(data), rollbackOnError: true, populateCache: false, revalidate: true }
          );
        } else {
          await action();
          await mutate();
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Something went wrong');
        await mutate();
      } finally {
        setPending(false);
      }
    },
    [base, data, mutate]
  );

  const vote = useCallback(
    (choice: CheckInVote) =>
      run(
        () => send(`${base}/vote`, 'PUT', { choice }),
        (view) => ({ ...view, myVote: choice, myReservation: false })
      ),
    [base, run]
  );
  const joinOrClaim = useCallback(() => run(() => send(`${base}/open-slot`, 'POST')), [base, run]);
  const leave = useCallback(() => run(() => send(`${base}/open-slot`, 'DELETE')), [base, run]);
  // One-day slot hand-off (SINGLE_DAY_NOMINATION_PLAN.md): pass your slot on / switch who to, or
  // take it back. Passing it on also sets your vote IN, so the page re-reads rather than guessing.
  const nominate = useCallback(
    (nomineePlayerId: number) => run(() => send(`${base}/nomination`, 'PUT', { nomineePlayerId })),
    [base, run]
  );
  const revokeNomination = useCallback(() => run(() => send(`${base}/nomination`, 'DELETE')), [base, run]);

  return {
    view: data,
    isLoading,
    notFound: error instanceof HttpError && (error.status === 404 || error.status === 400),
    error: error instanceof HttpError && (error.status === 404 || error.status === 400) ? null : error,
    actionError,
    pending,
    vote,
    joinOrClaim,
    leave,
    nominate,
    revokeNomination,
    // Searched by the hand-off picker: GET ?query= returns { id, name, maskedEmail }[].
    nominationUrl: base ? `${base}/nomination` : null,
  };
}
