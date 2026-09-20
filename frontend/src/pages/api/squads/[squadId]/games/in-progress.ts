import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { parseSquadId } from '@/lib/api/squadParam';

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

    // Calculate progress for each game
    const gamesWithProgress = games.map(game => {
      const scores = game.scores as Record<string, Record<string, { team1Score: number; team2Score: number }>>;
      const groups = game.groups as Record<string, number[]>;

      let totalMatches = 0;
      let completedMatches = 0;

      // Calculate total matches and completed matches for each group
      Object.entries(groups).forEach(([groupName, players]) => {
        // Calculate number of matches in this group
        const n = players.length;
        const matchesInGroup = (n * (n - 1)) / 4; // Formula for number of matches in a group
        totalMatches += matchesInGroup;

        // Count completed matches
        const groupScores = scores[groupName] || {};
        Object.values(groupScores).forEach(score => {
          if (score.team1Score > 0 || score.team2Score > 0) {
            completedMatches++;
          }
        });
      });

      return {
        ...game,
        progress: totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0
      };
    });

    res.status(200).json(gamesWithProgress);
  } catch (error) {
    console.error('Fetch In-Progress Games API Error:', error);
    res.status(500).json({ message: 'Failed to fetch in-progress games' });
  }
}
