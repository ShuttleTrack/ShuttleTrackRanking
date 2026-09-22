import React from 'react';
import { useRankings } from '@/hooks/useRankings';
import Leaderboard from '@/components/leaderboard/Leaderboard';
import PageHeader from '@/components/leaderboard/PageHeader';
import { SquadBoardSelector } from '@/components/leaderboard/SquadBoardSelector';
import { useJoinSquadCallout } from '@/components/squads/JoinSquadCallout';
import { useOptionalSquad } from '@/contexts/SquadContext';
import { PageLoader } from '@/components/common/GameLoader';

const RankingsComponent = () => {
  const squad = useOptionalSquad();
  const joinCallout = useJoinSquadCallout();
  const { rankings, error, isLoading } = useRankings();

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

  const activePlayers = rankings.players.filter((player) => player.playerRank > 0);

  return (
    <>
      <SquadBoardSelector currentSlug={squad?.slug} trailing={joinCallout?.inline} />
      {joinCallout?.modal}
      <PageHeader title="Leaderboard" />
      <Leaderboard players={activePlayers} />
    </>
  );
};

export default RankingsComponent;
