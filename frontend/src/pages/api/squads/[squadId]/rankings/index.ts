import { getPlayers } from '@/lib/ranking/players';
import { getAllEncounters } from '@/lib/ranking/encounters';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { PlayerRankingData, RankingsResponse } from '@/types/rankings';
import { buildFormStatsByPlayerId } from '@/utils/playerForm';
import { buildLastGameDayNetByPlayerId } from '@/utils/playerLastGameDay';
import { parseSquadId } from '@/lib/api/squadParam';

// Public - no login required (SQUAD_TENANCY_PLAN.md: the ranking board is the one page that was
// always public and stays that way).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  try {
    const [players, encounters] = await Promise.all([getPlayers(squadId), getAllEncounters(squadId)]);

    // This endpoint never filtered by status (getPlayers() with no arg = every player,
    // including inactive ones with null rankScore/playerRank/previousRank/timeInHighestRank -
    // same as before the cutover, just now accurately typed instead of an untyped fetch
    // response). Preserved exactly via non-null assertions rather than adding new null
    // handling that wasn't there previously - not this cutover's job to fix.
    const totalPlayers = players.length;
    const topScore = Math.max(...players.map((p) => p.rankScore!));
    const averageScore =
      players.reduce((acc, p) => acc + p.rankScore!, 0) / totalPlayers;

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
            direction:
              rankChange > 0 ? 'up' : rankChange < 0 ? 'down' : 'none',
            amount: Math.abs(rankChange),
          },
          isAboveAverage: player.rankScore! > averageScore,
          lastFive: form?.lastFive ?? [],
          winRate: form?.winRate ?? 0,
          lastGameDayNet: lastDayNetByPlayer.get(player.id) ?? null,
        };
      })
      .sort((a, b) => a.playerRank - b.playerRank);

    const response: RankingsResponse = {
      stats: {
        totalPlayers,
        topScore,
        averageScore,
      },
      players: enrichedPlayers as PlayerRankingData[],
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Rankings API Error:', error);
    res.status(500).json({ message: 'Failed to fetch rankings' });
  }
}
