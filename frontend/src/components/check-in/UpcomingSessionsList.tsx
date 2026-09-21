import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSquad } from '@/contexts/SquadContext';
import {
  formatSessionTimeRange,
  formatSessionTitle,
  upcomingSessions,
} from '@/lib/check-in/schedule';
import { readStoredVote } from '@/lib/check-in/storage';
import type { CheckInVote, GameDay } from '@/lib/check-in/types';

function voteChipLabel(vote: CheckInVote | null): string {
  if (vote === 'IN') return 'In';
  if (vote === 'OUT') return 'Out';
  return 'Not voted';
}

function voteChipClass(vote: CheckInVote | null): string {
  if (vote === 'IN') return 'bg-primary/20 text-primary';
  if (vote === 'OUT') return 'bg-red-950/40 text-red-400';
  return 'bg-white/10 text-on-surface-variant';
}

interface UpcomingSessionsListProps {
  playerId?: number;
}

export function UpcomingSessionsList({ playerId }: UpcomingSessionsListProps) {
  const { slug } = useSquad();
  const [now, setNow] = useState(() => new Date());
  const sessions = useMemo(() => upcomingSessions(now), [now]);
  const [votes, setVotes] = useState<Record<string, CheckInVote | null>>({});

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const refreshVotes = useCallback(() => {
    if (playerId === undefined) return;
    const next: Record<string, CheckInVote | null> = {};
    for (const session of sessions) {
      next[session.id] = readStoredVote(session.id, playerId);
    }
    setVotes(next);
  }, [playerId, sessions]);

  useEffect(() => {
    refreshVotes();
  }, [refreshVotes]);

  useEffect(() => {
    const onStorage = () => refreshVotes();
    const onFocus = () => refreshVotes();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshVotes]);

  return (
    <section className="mt-8 max-w-3xl">
      <h2 className="font-headline text-lg font-bold text-on-surface">Upcoming sessions</h2>
      <div className="mt-3 h-0.5 w-8 rounded-full bg-primary/80" aria-hidden />
      <ul className="mt-4 space-y-3">
        {sessions.map((session: GameDay) => {
          const vote = votes[session.id] ?? null;
          return (
            <li
              key={session.id}
              className="rounded-xl border border-gray-600 bg-surface-container/90 p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/s/${slug}/game-day/${session.id}`} className="min-w-0 flex-1 group">
                  <p className="font-headline font-semibold text-on-surface group-hover:text-primary transition-colors">
                    {formatSessionTitle(session)}
                  </p>
                  <p className="mt-0.5 font-numeric text-sm tabular-nums text-on-surface-variant">
                    {formatSessionTimeRange(session)}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-wide ${voteChipClass(vote)}`}
                  >
                    {voteChipLabel(vote)}
                  </span>
                </Link>
                <Link
                  href={`/s/${slug}/game-day/${session.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-2.5 font-headline text-sm font-bold text-black transition-opacity hover:opacity-90"
                >
                  Check in
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
