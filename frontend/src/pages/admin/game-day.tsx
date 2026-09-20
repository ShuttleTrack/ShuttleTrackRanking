import React from 'react';
import { useRouter } from 'next/router';
import { usePlayers } from '@/hooks/usePlayers';
import { useGame } from '@/hooks/useGame';
import { GroupCard } from '@/components/game-day/GroupCard';
import { NavigationButtons } from '@/components/game-day/NavigationButtons';
import type { Player } from '@/types/player';
import { PageLoader } from '@/components/common/GameLoader';

const GameDayPage = () => {
  const router = useRouter();
  const { gameId } = router.query;
  const { players, isLoading: playersLoading } = usePlayers();
  const { game, isLoading: gameLoading } = useGame(gameId as string);

  if (gameLoading || playersLoading) {
    return <PageLoader variant="compact" label="Loading game day" />;
  }

  if (!game) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8 text-center">
        <h1 className="font-headline text-2xl font-extrabold text-on-surface">Game not found</h1>
        <button
          type="button"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90"
          onClick={() => router.push('/admin/game-planner')}
        >
          Back to Game Planner
        </button>
      </div>
    );
  }

  const groups = Object.entries(game.groups as Record<string, number[]>).reduce((acc, [groupName, playerIds]) => {
    acc[groupName] = playerIds
      .map((id) => players.find((p) => p.id === id))
      .filter((player): player is NonNullable<typeof player> => player !== undefined)
      .sort((a, b) => a.playerRank - b.playerRank);
    return acc;
  }, {} as Record<string, Player[]>);

  const handleBack = () => {
    router.push({
      pathname: '/admin/game-planner',
      query: { gameId },
    });
  };

  const handleContinue = () => {
    router.push({
      pathname: '/admin/score-keeper',
      query: { gameId },
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <section className="mb-6 sm:mb-8">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Game Day Groups
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {Object.entries(groups).map(([groupName, groupPlayers]) => (
          <GroupCard key={groupName} groupName={groupName} players={groupPlayers} />
        ))}
      </div>

      <NavigationButtons onBack={handleBack} onContinue={handleContinue} />
    </div>
  );
};

export default GameDayPage;
