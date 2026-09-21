import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMySquads } from '@/hooks/useMySquads';
import { SquadBoardSelector } from './SquadBoardSelector';

function SelectorBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative border-y border-white/5 bg-black/30 mb-2 sm:mb-3">
      <div className="pointer-events-none absolute inset-0 form-strip" aria-hidden />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-8 py-1.5 sm:py-2">{children}</div>
      <div className="h-px w-full kinetic-gradient" aria-hidden />
    </div>
  );
}

const PublicRankingsCallout = () => {
  const { data: session } = useSession();
  const { squads } = useMySquads();
  const hasSquads = session && squads.length > 0;

  if (hasSquads) {
    return <SquadBoardSelector />;
  }

  return (
    <SelectorBand>
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3"
        role="status"
      >
        <p className="text-sm text-on-surface-variant font-medium text-center sm:text-left leading-snug">
          {session
            ? 'Select a squad to see detailed rankings, encounter history, and game days.'
            : 'Sign in and select a squad to see detailed rankings, encounter history, and game days.'}
        </p>
        {!session && (
          <Link
            href="/login"
            className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-container-high/50 px-4 py-1.5 font-headline text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 mx-auto sm:mx-0"
          >
            Sign in
          </Link>
        )}
      </div>
    </SelectorBand>
  );
};

export default PublicRankingsCallout;
