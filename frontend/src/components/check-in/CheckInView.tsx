import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import {
  formatSessionTimeRange,
  formatSessionTitle,
  sessionPhase,
  sessionStatusLabel,
} from '@/lib/check-in/schedule';
import type { CheckInState } from '@/lib/check-in/types';
import { CheckInRoster } from './CheckInRoster';
import { CheckInVoteButtons } from './CheckInVoteButtons';

export const profileBackLinkClass =
  'inline-flex min-h-11 items-center gap-1.5 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-primary';

export function ProfileBackLink({
  children = 'Profile',
  className = '',
}: {
  children?: string;
  className?: string;
}) {
  return (
    <Link href="/user/profile" className={`${profileBackLinkClass} ${className}`.trim()}>
      <ArrowLeftIcon className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

interface CheckInViewProps {
  state: CheckInState;
  now: Date;
  currentPlayerId?: number;
  avatarUrl?: string;
  onVote: (vote: 'IN' | 'OUT') => void;
}

function phaseChipClass(phase: ReturnType<typeof sessionPhase>): string {
  if (phase === 'live') return 'bg-primary/20 text-primary';
  if (phase === 'ended') return 'bg-white/10 text-on-surface-variant';
  return 'bg-white/5 text-on-surface-variant';
}

export function CheckInView({
  state,
  now,
  currentPlayerId,
  avatarUrl,
  onVote,
}: CheckInViewProps) {
  const { gameDay, myVote, inPlayers, outPlayers } = state;
  const phase = sessionPhase(gameDay, now);
  const status = sessionStatusLabel(gameDay, now);
  const showRoster = myVote !== null;

  return (
    <div className="max-w-3xl">
      <section
        className="rounded-xl border border-gray-600 bg-surface-container/90 p-5 sm:p-6 motion-safe:animate-fadeIn"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-headline text-xl font-bold text-on-surface sm:text-2xl">
              {formatSessionTitle(gameDay)}
            </h2>
            <p className="mt-1 font-numeric text-lg tabular-nums text-primary">
              {formatSessionTimeRange(gameDay)}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">{gameDay.timezone}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 font-label text-[10px] font-bold uppercase tracking-widest ${phaseChipClass(phase)}`}
          >
            {status}
          </span>
        </div>

        {showRoster ? (
          <CheckInRoster
            nested
            myVote={myVote}
            inPlayers={inPlayers}
            outPlayers={outPlayers}
            currentPlayerId={currentPlayerId}
            avatarUrl={avatarUrl}
          />
        ) : null}

        <div className={showRoster ? 'mt-6 border-t border-gray-600 pt-5' : 'mt-6'}>
          <p className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-80">
            Your vote
          </p>
          <div className="mt-3">
            <CheckInVoteButtons myVote={myVote} onVote={onVote} />
          </div>
          {!showRoster ? (
            <p className="mt-4 text-sm text-on-surface-variant">
              Vote in or out to see who else is playing.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function CheckInNotFound() {
  return (
    <div className="max-w-lg text-center">
      <h2 className="font-headline text-2xl font-bold text-on-surface">Session not found</h2>
      <p className="mt-2 text-on-surface-variant">
        This check-in link isn&apos;t valid. Pick an upcoming session from your profile.
      </p>
      <p className="mt-6 flex justify-center">
        <ProfileBackLink>Go to profile</ProfileBackLink>
      </p>
    </div>
  );
}
