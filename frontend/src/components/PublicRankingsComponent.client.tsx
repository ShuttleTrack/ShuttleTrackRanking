import React from 'react';
import { usePublicRankings } from '@/hooks/usePublicRankings';
import Leaderboard from '@/components/leaderboard/Leaderboard';
import PageHeader from '@/components/leaderboard/PageHeader';
import PublicRankingsCallout from '@/components/leaderboard/PublicRankingsCallout';
import { PageLoader } from '@/components/common/GameLoader';

const PublicRankingsComponent = () => {
  const { rankings, error, isLoading } = usePublicRankings();

  if (isLoading) {
    return <PageLoader variant="compact" label="Loading rankings" />;
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

  if (rankings.players.length === 0) {
    return (
      <div className="min-h-screen">
        <PublicRankingsCallout />
        <PageHeader title="Public Leaderboard" />
        <div className="max-w-7xl mx-auto px-8 pb-20">
          <div className="rounded-xl border border-gray-600 bg-surface-container p-6 text-on-surface-variant">
            No ranked players on public squads yet.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PublicRankingsCallout />
      <PageHeader title="Public Leaderboard" />
      <Leaderboard players={rankings.players} variant="public" />
    </div>
  );
};

export default PublicRankingsComponent;
