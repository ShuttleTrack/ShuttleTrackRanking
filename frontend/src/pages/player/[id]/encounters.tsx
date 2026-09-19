import React from 'react';
import { useRouter } from 'next/router';
import PlayerEncountersCompactComponent from '@/components/PlayerEncounterCompactComponent.client';

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
