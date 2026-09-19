import React from 'react';
import { useRankings } from '@/hooks/useRankings';
import Leaderboard from '@/components/leaderboard/Leaderboard';
import PageHeader from '@/components/leaderboard/PageHeader';

const RankingsComponent = () => {
  const { rankings, error, isLoading } = useRankings();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div
          className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"
          role="status"
          aria-label="Loading rankings"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-6 py-4 text-red-300">
          Error fetching rankings: {error.message}
        </div>
      </div>
    );
  }

  if (!rankings) return null;

  const activePlayers = rankings.players.filter((player) => player.playerRank > 0);

  return (
    <>
      <PageHeader title="Leaderboard" />
      <Leaderboard players={activePlayers} />
    </>
  );
};

export default RankingsComponent;
