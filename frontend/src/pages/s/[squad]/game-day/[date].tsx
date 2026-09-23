import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useSession } from 'next-auth/react';
import { PageLoader } from '@/components/common/GameLoader';
import { CheckInNotFound, CheckInView } from '@/components/check-in/CheckInView';
import { useGameDayCheckIn } from '@/hooks/useGameDayCheckIn';
import { useRequireUser } from '@/hooks/useRequireUser';
import { resolveSquadUserOrRedirect } from '@/lib/squadPage';
import type { SquadSummary } from '@/contexts/SquadContext';

interface GameDayCheckInPageProps {
  squad: SquadSummary;
  playerId: number | null;
}

// /s/{slug}/game-day/{YYYY-MM-DD} - the link the vote-is-open Telegram post carries
// (ATTENDANCE_VOTE_PLAN.md, Decision 1). Gated by resolveSquadUserOrRedirect: signed in AND a
// Player in this squad, or a platform superadmin - who has no Player row and gets the observer
// view rather than a blank page. A signed-out visitor is redirected server-side to
// /login?callbackUrl=<this page> and never sees the roster, which is what keeps the readable
// date URL acceptable.
const GameDayCheckInPage = (_props: GameDayCheckInPageProps) => {
  const router = useRouter();
  const date = typeof router.query.date === 'string' ? router.query.date : undefined;
  const { data: session } = useSession();
  // The server gate has already decided access; `true` keeps the hook's !isUser redirect from
  // fighting the superadmin-observer case it admits.
  const { status } = useRequireUser(true);
  const {
    view,
    isLoading,
    notFound,
    error,
    actionError,
    pending,
    vote,
    joinOrClaim,
    leave,
    nominate,
    revokeNomination,
    nominationUrl,
  } = useGameDayCheckIn(date);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (status === 'loading' || !router.isReady || isLoading) {
    return <PageLoader variant="tall" label="Loading check-in" />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <header className="mb-6">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">Check in</h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      </header>

      {notFound ? (
        <CheckInNotFound />
      ) : error || !view ? (
        <p className="text-red-400">Could not load this session. Try again later.</p>
      ) : (
        <CheckInView
          view={view}
          now={now}
          avatarUrl={session?.user?.image ?? undefined}
          pending={pending}
          actionError={actionError}
          onVote={vote}
          onJoinOrClaim={joinOrClaim}
          onLeave={leave}
          nominationUrl={nominationUrl}
          onNominate={nominate}
          onRevokeNomination={revokeNomination}
        />
      )}
    </div>
  );
};

export default GameDayCheckInPage;

export const getServerSideProps: GetServerSideProps<GameDayCheckInPageProps> = async (context) => {
  return resolveSquadUserOrRedirect(context);
};
