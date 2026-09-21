import React from 'react';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import PlayerEncountersCompactComponent from '@/components/PlayerEncounterCompactComponent.client';
import { resolveSquadOrNotFound } from '@/lib/squadPage';
import type { SquadSummary } from '@/contexts/SquadContext';

const PlayerEncountersPage = () => {
  const router = useRouter();
  const { id } = router.query;

  return (
    <div className="min-h-screen">
      <PlayerEncountersCompactComponent playerId={id} />
    </div>
  );
};

export default PlayerEncountersPage;

// Public - no login required (SQUAD_TENANCY_PLAN.md: player ranking history stays a public board).
export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadOrNotFound(context);
};
