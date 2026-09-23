import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { parseSquadId } from '@/lib/api/squadParam';
import { gameProgress, type GameGroups, type GameScores } from '@/lib/games/liveGames';

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
    const games = await prisma.game.findMany({
      where: {
        squadId,
        status: 'IN_PROGRESS'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const gamesWithProgress = games.map(game => ({
      ...game,
      progress: gameProgress(game.groups as GameGroups, game.scores as GameScores)
    }));

    res.status(200).json(gamesWithProgress);
  } catch (error) {
    console.error('Fetch In-Progress Games API Error:', error);
    res.status(500).json({ message: 'Failed to fetch in-progress games' });
  }
}
