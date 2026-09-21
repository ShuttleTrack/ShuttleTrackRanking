import type { PlayerInfo } from '@/lib/ranking/players';
import type { PlayerRankingData, RankingsResponse } from '@/types/rankings';
import { buildFormStatsByPlayerId } from '@/utils/playerForm';
import { buildLastGameDayNetByPlayerId } from '@/utils/playerLastGameDay';
import type { RawEncounter } from '@/utils/playerForm';

export function buildSquadRankingsResponse(
  players: PlayerInfo[],
  encounters: RawEncounter[]
): RankingsResponse {
  // `players` is expected to already be board-visibility-filtered by the caller (see
  // filterBoardVisible in boardVisibility.ts) - this only guards against a null rankScore
  // (an inactive player, per toPlayerInfo) slipping into the stats, rather than the old
  // `rankScore!` assertions' implicit null-coerces-to-0 (OPEN_SLOT_PLAYERS_PLAN.md).
  const scored = players.filter((p) => p.rankScore !== null);

  const totalPlayers = scored.length;
  const topScore = totalPlayers > 0 ? Math.max(...scored.map((p) => p.rankScore!)) : 0;
  const averageScore =
    totalPlayers > 0
      ? scored.reduce((acc, p) => acc + p.rankScore!, 0) / totalPlayers
      : 0;

  const formByPlayer = buildFormStatsByPlayerId(
    scored.map((p) => p.id),
    encounters
  );

  const lastDayNetByPlayer = buildLastGameDayNetByPlayerId(
    scored.map((p) => p.id),
    encounters
  );

  const enrichedPlayers = scored
    .map((player) => {
      const rankChange = player.previousRank! - player.playerRank!;
      const form = formByPlayer.get(player.id);
      return {
        id: player.id,
        name: player.name,
        playerRank: player.playerRank!,
        previousRank: player.previousRank!,
        rankScore: player.rankScore!,
        highestRank: player.highestRank,
        timeInHighestRank: player.timeInHighestRank!.replace('(', '').replace(')', ''),
        rankChange: {
          direction: rankChange > 0 ? 'up' : rankChange < 0 ? 'down' : 'none',
          amount: Math.abs(rankChange),
        },
        isAboveAverage: player.rankScore! > averageScore,
        lastFive: form?.lastFive ?? [],
        winRate: form?.winRate ?? 0,
        lastGameDayNet: lastDayNetByPlayer.get(player.id) ?? null,
      };
    })
    .sort((a, b) => a.playerRank - b.playerRank);

  return {
    stats: {
      totalPlayers,
      topScore,
      averageScore,
    },
    players: enrichedPlayers as PlayerRankingData[],
  };
}
