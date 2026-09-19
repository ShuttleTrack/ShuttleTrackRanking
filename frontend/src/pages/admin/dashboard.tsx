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

  // Add authentication check
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || gamesLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  if (!session?.user?.isAdmin) return null;

  // Group games by status
  const gamesByStatus = Array.isArray(games) 
    ? games.reduce((acc, game) => {
        const status = game.status || 'DRAFT';
        if (!acc[status]) acc[status] = [];
        acc[status].push(game);
        return acc;
      }, {} as Record<string, typeof games>)
    : {};

  const getStatusBadgeClasses = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getGameLink = (game: Game) => {
    switch (game.status) {
      case 'IN_PROGRESS':
        return `/admin/score-keeper?gameId=${game.id}`;
      case 'COMPLETED':
        return `/admin/game-day?gameId=${game.id}`; // Could also create a summary view
      default: // DRAFT
        return `/admin/game-day?gameId=${game.id}`;
    }
  };

  const getGameStats = (game: Game) => {
    const scores = (game.scores as unknown) as Record<string, Record<string, MatchScore>>;
    const groups = game.groups as Record<string, number[]>;
    
    let totalGames = 0;
    let completedGames = 0;

    Object.entries(groups).forEach(([groupName]) => {
      const groupScores = scores[groupName] || {};
      Object.values(groupScores).forEach(score => {
        totalGames++;
        if (score.team1Score > 0 || score.team2Score > 0) {
          completedGames++;
        }
      });
    });

    return { totalGames, completedGames };
  };

  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-8">
        <DashboardHeader />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          {/* Left Column - Actions */}
          <div className="space-y-6">
            <div className="bg-base-100 rounded-lg shadow-lg p-6 border border-base-200">
              <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
              <div className="space-y-4">
                <Link
                  href="/admin/game-planner"
                  className="btn btn-primary w-full justify-start"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Create New Game
                </Link>
                <Link
                  href="/admin/players"
                  className="btn btn-secondary w-full justify-start"
                >
                  <UserGroupIcon className="h-5 w-5 mr-2" />
                  Manage Players
                </Link>
              </div>
            </div>

            <div className="bg-base-100 rounded-lg shadow-lg p-6 border border-base-200">
              <h2 className="text-xl font-semibold mb-4">Telegram Scheduler Test</h2>
              <p className="text-sm text-base-content/60 mb-4">
                Sends a one-off test message to each configured group, so the bot token/chat id
                pairs can be checked without waiting for the daily 17:00 poll.
              </p>
              <div className="space-y-3">
                {TELEGRAM_TEST_GROUPS.map(({ group, label }) => {
                  const state = telegramTestState[group];
                  return (
                    <div key={group}>
                      <button
                        type="button"
                        className="btn btn-outline w-full justify-start"
                        disabled={state.loading}
                        onClick={() => handleTelegramTest(group)}
                      >
                        {state.loading ? (
                          <span className="loading loading-spinner loading-sm mr-2"></span>
                        ) : (
                          <PaperAirplaneIcon className="h-5 w-5 mr-2" />
                        )}
                        {label}
                      </button>
                      {state.message && (
                        <p className={`text-sm mt-1 ${state.isError ? 'text-error' : 'text-success'}`}>
                          {state.message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column - Games List */}
          <div className="space-y-6">
            <div className="bg-base-100 rounded-lg shadow-lg p-6 border border-base-200">
              <h2 className="text-xl font-semibold mb-4">Games</h2>
              {gamesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="loading loading-spinner loading-lg"></div>
                </div>
              ) : games.length > 0 ? (
                <div className="space-y-4">
                  {games.map((game) => (
                    <div
                      key={game.id}
                      className="border border-base-200 rounded-lg p-4 hover:bg-base-200 transition-colors cursor-pointer"
                      onClick={() => router.push(getGameLink(game))}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-medium">Game #{game.id.slice(-4)}</h3>
                          <p className="text-sm text-base-content/60">
                            {format(new Date(game.createdAt), 'PPp')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {game.status === 'IN_PROGRESS' && (
                            <span className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </span>
                          )}
                          <div className="flex flex-col items-end gap-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(game.status)}`}>
                              {(game.status || 'DRAFT').replace('_', ' ')}
                            </span>
                            {game.status === 'IN_PROGRESS' && (() => {
                              const { completedGames, totalGames } = getGameStats(game);
                              const progress = Math.round((completedGames / totalGames) * 100);
                              return (
                                <div className="w-32">
                                  <div className="text-xs text-right mb-1">{completedGames}/{totalGames} completed</div>
                                  <div className="w-full bg-base-300 rounded-full h-1.5">
                                    <div 
                                      className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-base-content/60">
                  No games available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage; 