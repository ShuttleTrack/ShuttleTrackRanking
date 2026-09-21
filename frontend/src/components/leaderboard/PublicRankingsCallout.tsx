import { useSession } from 'next-auth/react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { useMySquads } from '@/hooks/useMySquads';
import { SquadBoardSelector, SelectorBand } from './SquadBoardSelector';

const PublicRankingsCallout = () => {
  const { data: session } = useSession();
  const { squads, isLoading } = useMySquads();
  const hasSquads = session && squads.length > 0;

  if (isLoading) {
    return (
      <SelectorBand>
        <div className="min-h-[36px]" aria-hidden />
      </SelectorBand>
    );
  }

  if (hasSquads) {
    return <SquadBoardSelector />;
  }

  const message = session
    ? 'Join a squad for rankings and match history.'
    : 'Sign in for squad rankings and match history.';

  return (
    <SelectorBand scrim>
      <div className="flex min-h-[36px] items-center justify-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary"
          aria-hidden
        >
          <LockClosedIcon className="h-4 w-4" />
        </span>
        <p className="min-w-0 text-[13px] font-medium leading-none text-on-surface-variant sm:text-sm">
          {message}
        </p>
      </div>
    </SelectorBand>
  );
};

export default PublicRankingsCallout;
