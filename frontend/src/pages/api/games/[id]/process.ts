import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { processEncountersForDate } from '@/lib/ranking/processEncounters';

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseDateOnly(dateString: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Check authentication and get session
  const session = await requireAuth(req, res);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ message: 'Invalid game ID' });
  }

  try {
    // Get game to verify all scores are submitted
    const game = await prisma.game.findUnique({
      where: { id }
    });

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const gameDate = formatDate(game.createdAt);

    const scores = game.scores as Record<string, Record<string, { team1Score: number; team2Score: number; submitted?: boolean }>>;
    
    // Verify all scores are submitted
    for (const groupScores of Object.values(scores)) {
      for (const score of Object.values(groupScores)) {
        if (score.team1Score > 0 || score.team2Score > 0) {
          if (!score.submitted) {
            return res.status(400).json({ 
              message: 'Not all scores have been submitted yet' 
            });
          }
        }
      }
    }

    // Process scores
    await processEncountersForDate(parseDateOnly(gameDate));

    // Update game status to COMPLETED
    const updatedGame = await prisma.game.update({
      where: { id },
      data: { status: 'COMPLETED' }
    });

    res.status(200).json(updatedGame);
  } catch (error) {
    console.error('Process Scores API Error:', error);
    res.status(500).json({ message: 'Failed to process scores' });
  }
} 