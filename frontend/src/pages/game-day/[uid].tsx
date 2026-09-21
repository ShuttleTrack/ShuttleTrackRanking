import { useRouter } from 'next/router';
import { useMemo, useState, useEffect } from 'react';
import { PageLoader } from '@/components/common/GameLoader';
import { CheckInNotFound, CheckInView } from '@/components/check-in/CheckInView';
import { useGameDayCheckIn } from '@/hooks/useGameDayCheckIn';
import { useRequireUser } from '@/hooks/useRequireUser';

const GameDayCheckInPage = () => {
  const router = useRouter();
  const uid = router.query.uid as string | undefined;
  const { session, status, isUser } = useRequireUser();
  const playerId = session?.user?.playerId;
  const { data, isLoading, error, castVote, notFound } = useGameDayCheckIn(uid, playerId);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const pageLoading = status === 'loading' || isLoading || !router.isReady;

  const avatarUrl = useMemo(() => session?.user?.image, [session?.user?.image]);

  if (pageLoading) {
    return <PageLoader variant="tall" label="Loading check-in" />;
  }

  if (!isUser) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <header className="mb-6">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Check in
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      </header>

      {error ? (
        <p className="text-red-400">Could not load players. Try again later.</p>
      ) : notFound || !data ? (
        <CheckInNotFound />
      ) : (
        <CheckInView
          state={data}
          now={now}
          currentPlayerId={playerId}
          avatarUrl={avatarUrl}
          onVote={castVote}
        />
      )}
    </div>
  );
};

export default GameDayCheckInPage;
