import React from 'react';
import type { GetServerSideProps } from 'next';
import RankingsComponent from '@/components/RankingsComponent.client';
import { JoinSquadCallout } from '@/components/squads/JoinSquadCallout';
import { resolveSquadOrNotFound } from '@/lib/squadPage';
import type { SquadSummary } from '@/contexts/SquadContext';

const Home = () => {
  return (
    <div className="min-h-screen">
      {/* Renders nothing unless this squad is open for registration and the viewer isn't
          already on its roster (SELF_REGISTRATION_PLAN.md). */}
      <JoinSquadCallout />
      <RankingsComponent />
    </div>
  );
};

export default Home;

// Public - no login required (SQUAD_TENANCY_PLAN.md: the ranking board is the one page that was
// always public and stays that way).
export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadOrNotFound(context);
};
