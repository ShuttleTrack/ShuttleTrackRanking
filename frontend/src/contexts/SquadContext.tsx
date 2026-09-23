import React, { createContext, useContext } from 'react';

// Multi-squad tenancy (SQUAD_TENANCY_PLAN.md): every squad-scoped page resolves its Squad by
// slug server-side (getServerSideProps) and wraps its tree in this provider, so hooks/components
// anywhere below it can build squad-scoped API URLs without threading a squadId prop through
// every call site individually.

export interface SquadSummary {
  id: number;
  slug: string;
  name: string;
  // Resolved once per page load (see lib/squadPage.ts) so nav components (AccountMenu, etc.)
  // can show squad-aware links without a client-side fetch. Both false for a signed-out visitor.
  isSquadAdmin: boolean;
  isPlayerHere: boolean;
  // Whether this squad accepts self-service join requests (SELF_REGISTRATION_PLAN.md). Carried
  // on the summary so the public board can offer a "Request to join" CTA to a signed-in
  // non-member without a second fetch - that board is where someone handed a share link
  // actually lands, so sending them to the directory to find the squad they're looking at
  // would be silly.
  openForOpenSlot: boolean;
}

const SquadContext = createContext<SquadSummary | null>(null);

export function SquadProvider({ squad, children }: { squad: SquadSummary; children: React.ReactNode }) {
  return <SquadContext.Provider value={squad}>{children}</SquadContext.Provider>;
}

// Throws outside a SquadProvider - every squad-scoped page must resolve and provide one, so a
// missing provider is a bug at the call site, not a state to render around.
export function useSquad(): SquadSummary {
  const squad = useContext(SquadContext);
  if (!squad) {
    throw new Error('useSquad() called outside a SquadProvider');
  }
  return squad;
}

// For components shared across squad-scoped and non-squad-scoped pages (global nav, mostly) -
// e.g. the squad picker and platform-admin pages render no SquadProvider at all.
export function useOptionalSquad(): SquadSummary | null {
  return useContext(SquadContext);
}
