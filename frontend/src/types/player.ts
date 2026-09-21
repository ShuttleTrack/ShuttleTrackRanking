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
  // The server's own three-state derived status (see lib/ranking/playerStatus.ts). `active`
  // above only distinguishes ACTIVE from everything else, which can't tell a disabled player
  // apart from one who simply hasn't played their first game yet.
  status: 'ACTIVE' | 'ENABLED' | 'DISABLED';
  // True once the player has a rankScore on their row at all. Not the same as
  // `rankScore !== null` here: that field is nulled for every non-ACTIVE player, so it can't be
  // used to spot a player who still needs a starting score (OPEN_SLOT_PLAYERS_PLAN.md).
  hasScore: boolean;
}

export interface PlayerContextType {
  players: Player[];
  loading: boolean;
  error: Error | null;
}
