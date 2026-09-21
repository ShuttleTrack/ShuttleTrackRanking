import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import type { GetServerSideProps } from 'next';
import { useRankings } from '@/hooks/useRankings';
import { useRequireUser } from '@/hooks/useRequireUser';
import { capitalizeFirstLetter } from '@/utils/string';
import TrendIndicator from '@/components/leaderboard/TrendIndicator';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadUserOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';

const iconOutlineBtn =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 text-on-surface transition-colors hover:border-primary/40';

interface UserProfilePageProps {
  squad: SquadSummary;
  playerId: number | null;
}

const UserProfilePage = ({ playerId }: UserProfilePageProps) => {
  const { name: squadName } = useSquad();
  const { data: session } = useSession();
  const { status } = useRequireUser(playerId !== null);
  const { rankings, isLoading: rankingsLoading } = useRankings();
  const currentUser = rankings?.players.find((p) => p.id === playerId);

  if (status === 'loading' || rankingsLoading) {
    return <PageLoader variant="tall" label="Loading" />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <header className="mb-6">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Your profile
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      </header>

      {currentUser ? (
        <section className="max-w-3xl rounded-xl border border-gray-600 bg-surface-container overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-gray-600 p-4">
            <div className="flex min-w-0 items-center gap-3">
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded-full border-2 border-primary object-cover"
                />
              ) : (
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-surface-container-high font-headline font-semibold text-on-surface"
                >
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-headline font-semibold text-on-surface truncate">
                  {capitalizeFirstLetter(currentUser.name)}
                </div>
                <div className="text-xs text-on-surface-variant truncate">
                  {session?.user?.email}
                </div>
                <div className="mt-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 truncate">
                  {squadName}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={iconOutlineBtn}
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Sign out"
              aria-label="Sign out"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-4 divide-x divide-gray-600">
            <div className="p-3 text-center">
              <div className="font-label text-[10px] sm:text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                Rank
              </div>
              <div className="font-numeric mt-1 text-lg font-bold tabular-nums text-primary">
                #{currentUser.playerRank}
              </div>
            </div>
            <div className="p-3 flex flex-col items-center justify-center">
              <div className="font-label text-[10px] sm:text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                Change
              </div>
              <div className="mt-1">
                <TrendIndicator rankChange={currentUser.rankChange} variant="default" />
              </div>
            </div>
            <div className="p-3 text-center">
              <div className="font-label text-[10px] sm:text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                Score
              </div>
              <div className="font-numeric mt-1 text-lg font-bold tabular-nums text-on-surface">
                {currentUser.rankScore.toFixed(1)}
              </div>
            </div>
            <div className="p-3 text-center">
              <div className="font-label text-[10px] sm:text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                Highest
              </div>
              <div className="font-numeric mt-1 text-lg font-bold tabular-nums text-on-surface">
                #{currentUser.highestRank}
              </div>
            </div>
          </div>
        </section>
      ) : (
        // The rankings payload only carries ranked players (see rankingResponse.ts), so landing
        // here is the normal state for someone who hasn't played a game day yet - not an error.
        // It used to be one: the payload included them with a null rankScore, and the card above
        // went straight to rankScore.toFixed(1).
        <section className="max-w-3xl rounded-xl border border-gray-600 bg-surface-container p-4">
          <div className="font-headline font-semibold text-on-surface">
            {capitalizeFirstLetter(session?.user?.name ?? 'Your profile')}
          </div>
          <div className="text-xs text-on-surface-variant mt-0.5">{session?.user?.email}</div>
          <p className="text-on-surface-variant text-sm mt-3">
            You don&apos;t have a ranking yet - it appears here once you&apos;ve played a game day
            and the scores have been processed.
          </p>
          <button
            type="button"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm text-on-surface transition-colors hover:border-primary/40"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Sign out
          </button>
        </section>
      )}
    </div>
  );
};

export default UserProfilePage;

export const getServerSideProps: GetServerSideProps<UserProfilePageProps> = async (context) => {
  return resolveSquadUserOrRedirect(context);
};
