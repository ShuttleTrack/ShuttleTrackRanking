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
  // Nullable (OPEN_SLOT_PLAYERS_PLAN.md): a scoreless open-slot player can reach this list via
  // getAvailablePlayersForGame. The comparator below gives nulls an explicit total order (sorted
  // last) rather than coercing - see that plan's "Null-rankScore safety" section for why `?? -
  // Infinity` is not safe here (two nulls would compare as NaN and destabilize the sort).
  rankScore: number | null;
  playerRank: number | null;
}

// PlayerUtil.getRankedPlayers: primary sort by rankScore descending, secondary (tiebreak) by
// current playerRank ascending - applied in that order in the Java stream (sorted twice, the
// *last* .sorted() call wins as the primary key), so ties on rankScore keep their existing
// relative order. Preserve the tiebreak order exactly - it affects displayed rank on score ties.
// With no nulls present this produces byte-identical output to the pre-open-slot behavior.
export function getRankedPlayers<T extends RankablePlayer>(players: T[]): T[] {
  return [...players]
    .sort((a, b) => (a.playerRank ?? 0) - (b.playerRank ?? 0))
    .sort((a, b) => {
      if (a.rankScore === null && b.rankScore === null) return 0;
      if (a.rankScore === null) return 1;
      if (b.rankScore === null) return -1;
      return b.rankScore - a.rankScore;
    });
}
