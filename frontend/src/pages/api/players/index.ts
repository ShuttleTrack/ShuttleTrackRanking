import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlayers, addPlayer } from '@/lib/ranking/players';
import { requireAuth } from '@/lib/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    // Require authentication for creating players
    const session = await requireAuth(req, res);
    if (!session) return;

    const { name, email, initialScore } = req.body;

    if (!name || !email || initialScore === undefined || initialScore <= 0) {
      return res.status(400).json({ message: 'Name, email and initial score are required' });
    }

    try {
      const player = await addPlayer({ name, email, initialScore: Number(initialScore) });
      res.status(201).json(player);
    } catch (error) {
      console.error('Create Player API Error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to create player'
      });
    }
  } else {
    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
      const players = await getPlayers();
      res.status(200).json(players);
    } catch (error) {
      console.error('Players API Error:', error);
      res.status(500).json({ message: 'Failed to fetch players' });
    }
  }
} 