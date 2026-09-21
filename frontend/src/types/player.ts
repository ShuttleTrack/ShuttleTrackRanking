import type { PlayerType } from '@prisma/client';

export interface Player {
  id: number;
  name: string;
  email?: string;
  // Nullable in reality (a scoreless open-slot player) even though several existing UI paths
  // don't yet check for it - OPEN_SLOT_PLAYERS_PLAN.md's game-planner/bulk-assign work checks
  // explicitly rather than trusting this declared type everywhere.
  rankScore: number | null;
  playerRank: number;
  previousRank: number;
  colorHex: string;
  highestRank: number;
  timeInHighestRank: string;
  active: boolean;
  playerType: PlayerType;
}

export interface PlayerContextType {
  players: Player[];
  loading: boolean;
  error: Error | null;
}
