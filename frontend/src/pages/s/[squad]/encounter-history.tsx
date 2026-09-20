import React from 'react';
import type { GetServerSideProps } from 'next';
import EncounterHistoryView from '@/components/encounter-history/EncounterHistoryView';
import { resolveSquadOrNotFound } from '@/lib/squadPage';
import type { SquadSummary } from '@/contexts/SquadContext';

const EncounterHistoryPage = () => {
  return (
    <div className="min-h-screen">
      <EncounterHistoryView />
    </div>
  );
};

export default EncounterHistoryPage;

// Public - no login required (SQUAD_TENANCY_PLAN.md: encounter history stays a public board).
export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadOrNotFound(context);
};
