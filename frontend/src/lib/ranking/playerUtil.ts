// Ported from backend util/PlayerUtil.java (MIGRATION_PLAN.md Phase 3 / §5).

const TEAM_ID_DELIMITER = ':';

export function parseTeamIds(idsString: string): number[] {
  return idsString.split(TEAM_ID_DELIMITER).map(Number);
}

// PlayerUtil.getTeamPlayerIdsString / getTeamPlayerIdsStringV2: ids joined ascending. Preserve
// this exact encoding - ScoreHistory/Encounter cross-references parse it back the same way.
export function encodeTeamIds(playerIds: number[]): string {
  return [...playerIds].sort((a, b) => a - b).join(TEAM_ID_DELIMITER);
}

export interface RankablePlayer {
  rankScore: number;
  playerRank: number | null;
}

// PlayerUtil.getRankedPlayers: primary sort by rankScore descending, secondary (tiebreak) by
// current playerRank ascending - applied in that order in the Java stream (sorted twice, the
// *last* .sorted() call wins as the primary key), so ties on rankScore keep their existing
// relative order. Preserve the tiebreak order exactly - it affects displayed rank on score ties.
export function getRankedPlayers<T extends RankablePlayer>(players: T[]): T[] {
  return [...players]
    .sort((a, b) => (a.playerRank ?? 0) - (b.playerRank ?? 0))
    .sort((a, b) => b.rankScore - a.rankScore);
}
