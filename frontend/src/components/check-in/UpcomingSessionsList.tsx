import Link from 'next/link';
import { useSquad } from '@/contexts/SquadContext';
import { useUpcomingGameDays } from '@/hooks/useUpcomingGameDays';
import { formatSessionTimeRange, formatSessionTitle } from '@/lib/check-in/schedule';
import type { UpcomingGameDay } from '@/lib/check-in/types';

function chip(gameDay: UpcomingGameDay): { label: string; className: string } {
  if (gameDay.myVote === 'IN') return { label: 'In', className: 'bg-primary/20 text-primary' };
  if (gameDay.myVote === 'OUT') return { label: 'Out', className: 'bg-red-950/40 text-red-400' };
  if (gameDay.myReservation) return { label: 'Slot passed to you', className: 'bg-primary/10 text-primary' };
  if (gameDay.myOpenSlotStatus === 'ASSIGNED') return { label: 'Slot assigned', className: 'bg-primary/10 text-primary' };
  if (gameDay.myOpenSlotStatus === 'WAITING') return { label: 'Waiting list', className: 'bg-white/10 text-on-surface' };
  if (gameDay.role === 'OPEN_SLOT') return { label: 'Open slot', className: 'bg-white/10 text-on-surface-variant' };
  if (gameDay.role === 'OBSERVER') return { label: 'No slot', className: 'bg-white/10 text-on-surface-variant' };
  return { label: 'Not voted', className: 'bg-white/10 text-on-surface-variant' };
}

// The squad's upcoming game days (not ended, not cancelled - so today's stays listed after voting
// closes at 13:00, when assignees still have to confirm) with the viewer's own state on each.
export function UpcomingSessionsList() {
  const { slug } = useSquad();
  const { gameDays, isLoading, error } = useUpcomingGameDays();

  if (isLoading) return null;

  return (
    <section className="mt-8 max-w-3xl">
      <h2 className="font-headline text-lg font-bold text-on-surface">Upcoming sessions</h2>
      <div className="mt-3 h-0.5 w-8 rounded-full bg-primary/80" aria-hidden />
      {error ? (
        <p className="mt-4 text-sm text-red-400">Could not load upcoming sessions.</p>
      ) : gameDays.length === 0 ? (
        <p className="mt-4 text-sm text-on-surface-variant">
          No sessions open for check-in yet - the vote opens a couple of days before each game day.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {gameDays.map((gameDay) => {
            const href = `/s/${slug}/game-day/${gameDay.gameDate}`;
            const { label, className } = chip(gameDay);
            return (
              <li
                key={gameDay.gameDate}
                className="rounded-xl border border-gray-600 bg-surface-container/90 p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={href} className="min-w-0 flex-1 group">
                    <p className="font-headline font-semibold text-on-surface group-hover:text-primary transition-colors">
                      {formatSessionTitle(gameDay)}
                    </p>
                    <p className="mt-0.5 font-numeric text-sm tabular-nums text-on-surface-variant">
                      {formatSessionTimeRange(gameDay)}
                      {gameDay.status === 'VOTING_CLOSED' ? ' · voting closed' : ''}
                    </p>
                    <span
                      className={`mt-2 inline-block rounded-full px-2.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-wide ${className}`}
                    >
                      {label}
                    </span>
                  </Link>
                  <Link
                    href={href}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-2.5 font-headline text-sm font-bold text-black transition-opacity hover:opacity-90"
                  >
                    Check in
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
