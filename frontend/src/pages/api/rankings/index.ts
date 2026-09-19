import { getPlayers } from '@/services/playerService';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { PlayerRankingData, RankingsResponse } from '@/types/rankings';
import {
  buildFormStatsByPlayerId,
  type RawEncounter,
} from '@/utils/playerForm';

async function fetchEncounters(): Promise<RawEncounter[]> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/encounters`);
  if (!response.ok) {
    throw new Error('Failed to fetch encounters');
  }
  return response.json();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const [players, encounters] = await Promise.all([getPlayers(), fetchEncounters()]);

    const totalPlayers = players.length;
    const topScore = Math.max(...players.map((p) => p.rankScore));
    const averageScore =
      players.reduce((acc, p) => acc + p.rankScore, 0) / totalPlayers;

    const formByPlayer = buildFormStatsByPlayerId(
      players.map((p) => p.id),
      encounters
    );

    const enrichedPlayers = players
      .map((player) => {
        const rankChange = player.previousRank - player.playerRank;
        const form = formByPlayer.get(player.id);
        return {
          id: player.id,
          name: player.name,
          playerRank: player.playerRank,
          previousRank: player.previousRank,
          rankScore: player.rankScore,
          highestRank: player.highestRank,
          timeInHighestRank: player.timeInHighestRank.replace('(', '').replace(')', ''),
          rankChange: {
            direction:
              rankChange > 0 ? 'up' : rankChange < 0 ? 'down' : 'none',
            amount: Math.abs(rankChange),
          },
          isAboveAverage: player.rankScore > averageScore,
          lastFive: form?.lastFive ?? [],
          winRate: form?.winRate ?? 0,
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
