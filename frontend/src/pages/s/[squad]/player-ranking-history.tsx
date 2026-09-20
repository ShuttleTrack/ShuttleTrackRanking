import React from 'react';
import type { GetServerSideProps } from 'next';
import RankingHistoryView from '@/components/ranking-history/RankingHistoryView';
import { resolveSquadOrNotFound } from '@/lib/squadPage';
import type { SquadSummary } from '@/contexts/SquadContext';

const PlayerRankingHistoryPage = () => {
  return (
    <div className="min-h-screen">
      <RankingHistoryView />
    </div>
  );
};

export default PlayerRankingHistoryPage;

// Public - no login required (SQUAD_TENANCY_PLAN.md: player ranking history stays a public board).
export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadOrNotFound(context);
};
