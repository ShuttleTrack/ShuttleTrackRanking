import type { PlayerInfo } from '@/lib/ranking/players';
import type { PlayerRankingData, RankingsResponse } from '@/types/rankings';
import { buildFormStatsByPlayerId } from '@/utils/playerForm';
import { buildLastGameDayNetByPlayerId } from '@/utils/playerLastGameDay';
import type { RawEncounter } from '@/utils/playerForm';

export function buildSquadRankingsResponse(
  players: PlayerInfo[],
  encounters: RawEncounter[]
): RankingsResponse {
  const totalPlayers = players.length;
  const topScore = totalPlayers > 0 ? Math.max(...players.map((p) => p.rankScore!)) : 0;
  const averageScore =
    totalPlayers > 0
      ? players.reduce((acc, p) => acc + p.rankScore!, 0) / totalPlayers
      : 0;

  const formByPlayer = buildFormStatsByPlayerId(
    players.map((p) => p.id),
    encounters
  );

  const lastDayNetByPlayer = buildLastGameDayNetByPlayerId(
    players.map((p) => p.id),
    encounters
  );

  const enrichedPlayers = players
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
