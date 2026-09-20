import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useGames } from '@/hooks/useGames';
import { DashboardHeader } from '@/components/dashboard/Header';
import { PlusIcon, UserGroupIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import type { Game } from '@prisma/client';
import type { MatchScore } from '@/types/game';

type TelegramTestGroup = 'wednesday' | 'friday';

interface TelegramTestState {
  loading: boolean;
  message?: string;
  isError?: boolean;
}

const TELEGRAM_TEST_GROUPS: { group: TelegramTestGroup; label: string }[] = [
  { group: 'wednesday', label: 'Test Wednesday group' },
  { group: 'friday', label: 'Test Friday group' },
];

const cardClass =
  'rounded-xl bg-surface-container/90 border border-gray-600 p-4 sm:p-6';

const sectionTitleClass = 'font-headline text-lg sm:text-xl font-semibold text-on-surface mb-4';

const outlineButtonClass =
  'flex w-full min-h-[44px] items-center justify-start gap-2 rounded-xl border border-white/10 bg-surface-container-high/50 px-4 py-3 font-medium text-on-surface transition-colors hover:border-primary/40 hover:bg-surface-container-high disabled:opacity-50';

const getStatusBadgeClasses = (status: string) => {
  switch (status) {
    case 'IN_PROGRESS':
      return 'bg-primary/20 text-primary border border-primary/40';
    case 'COMPLETED':
      return 'bg-surface-container-high text-on-surface-variant border border-gray-600';
    default:
      return 'bg-transparent text-on-surface-variant border border-outline-variant';
  }
};

const getGameLink = (game: Game) => {
  switch (game.status) {
    case 'IN_PROGRESS':
      return `/admin/score-keeper?gameId=${game.id}`;
    case 'COMPLETED':
      return `/admin/game-day?gameId=${game.id}`;
    default:
      return `/admin/game-day?gameId=${game.id}`;
  }
};

const getGameStats = (game: Game) => {
  const scores = game.scores as unknown as Record<string, Record<string, MatchScore>>;
  const groups = game.groups as Record<string, number[]>;

  let totalGames = 0;
  let completedGames = 0;

  Object.entries(groups).forEach(([groupName]) => {
    const groupScores = scores[groupName] || {};
    Object.values(groupScores).forEach((score) => {
      totalGames++;
      if (score.team1Score > 0 || score.team2Score > 0) {
        completedGames++;
      }
    });
  });

  return { totalGames, completedGames };
};

const DashboardPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { games = [], isLoading: gamesLoading } = useGames();
  const [telegramTestState, setTelegramTestState] = useState<Record<TelegramTestGroup, TelegramTestState>>({
    wednesday: { loading: false },
    friday: { loading: false },
  });

  const handleTelegramTest = async (group: TelegramTestGroup) => {
    setTelegramTestState((prev) => ({ ...prev, [group]: { loading: true } }));
    try {
      const response = await fetch('/api/admin/telegram-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group }),
      });
      const data = await response.json();
      setTelegramTestState((prev) => ({
        ...prev,
        [group]: { loading: false, message: data.message, isError: !response.ok },
      }));
    } catch (error) {
      setTelegramTestState((prev) => ({
        ...prev,
        [group]: {
          loading: false,
          message: error instanceof Error ? error.message : 'Failed to send test message',
          isError: true,
        },
      }));
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || gamesLoading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div
          className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"
          role="status"
          aria-label="Loading dashboard"
        />
      </div>
    );
  }

  if (!session?.user?.isAdmin) return null;

  return (
    <div className="pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8">
        <DashboardHeader />

        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-8">
          {/* Games — first on mobile */}
          <div className={`${cardClass} order-1 md:order-2 md:col-start-2`}>
            <h2 className={sectionTitleClass}>Games</h2>
            {games.length > 0 ? (
              <div className="space-y-3">
                {games.map((game) => {
                  const gameStatus = game.status || 'DRAFT';
                  const progressStats =
                    gameStatus === 'IN_PROGRESS' ? getGameStats(game) : null;
                  const progress =
                    progressStats && progressStats.totalGames > 0
                      ? Math.round((progressStats.completedGames / progressStats.totalGames) * 100)
                      : 0;

                  return (
                    <Link
                      key={game.id}
                      href={getGameLink(game)}
                      className="block rounded-xl border border-gray-600 p-4 transition-colors hover:border-primary/40 hover:bg-surface-container-high/50"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="font-headline font-semibold text-on-surface">
                            Game #{game.id.slice(-4)}
                          </h3>
                          <p className="text-sm text-on-surface-variant mt-0.5">
                            {format(new Date(game.createdAt), 'PPp')}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:items-end">
                          <div className="flex items-center gap-2">
                            {gameStatus === 'IN_PROGRESS' && (
                              <span className="relative flex h-3 w-3" aria-hidden>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-label font-bold uppercase tracking-wide ${getStatusBadgeClasses(gameStatus)}`}
                            >
                              {gameStatus.replace('_', ' ')}
                            </span>
                          </div>
                          {progressStats && progressStats.totalGames > 0 && (
                            <div className="w-full sm:w-32">
                              <div className="text-xs text-on-surface-variant text-right mb-1">
                                {progressStats.completedGames}/{progressStats.totalGames} completed
                              </div>
                              <div className="w-full bg-surface-container-highest rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-8 text-on-surface-variant">No games available</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className={`${cardClass} order-2 md:order-1`}>
            <h2 className={sectionTitleClass}>Quick Actions</h2>
            <div className="space-y-3">
              <Link
                href="/admin/game-planner"
                className="flex w-full min-h-[44px] items-center justify-start gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-black transition-opacity hover:opacity-90"
              >
                <PlusIcon className="h-5 w-5 shrink-0" aria-hidden />
                Create New Game
              </Link>
              <Link href="/admin/players" className={outlineButtonClass}>
                <UserGroupIcon className="h-5 w-5 shrink-0" aria-hidden />
                Manage Players
              </Link>
            </div>
          </div>

          {/* Telegram */}
          <div className={`${cardClass} order-3 md:order-3 md:col-start-1`}>
            <h2 className={sectionTitleClass}>Telegram Scheduler Test</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              Sends a one-off test message to each configured group, so the bot token/chat id pairs
              can be checked without waiting for the daily 17:00 poll.
            </p>
            <div className="space-y-3">
              {TELEGRAM_TEST_GROUPS.map(({ group, label }) => {
                const state = telegramTestState[group];
                return (
                  <div key={group}>
                    <button
                      type="button"
                      className={outlineButtonClass}
                      disabled={state.loading}
                      onClick={() => handleTelegramTest(group)}
                    >
                      {state.loading ? (
                        <span
                          className="h-5 w-5 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <PaperAirplaneIcon className="h-5 w-5 shrink-0" aria-hidden />
                      )}
                      {label}
                    </button>
                    {state.message && (
                      <p
                        className={`text-sm mt-1.5 ${state.isError ? 'text-red-400' : 'text-primary'}`}
                      >
                        {state.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
