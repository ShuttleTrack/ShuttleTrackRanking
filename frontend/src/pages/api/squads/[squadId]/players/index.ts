import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlayers, addPlayer } from '@/lib/ranking/players';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

// GET is public (the roster is part of the public ranking board); POST requires squad-admin.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (req.method === 'POST') {
    const session = await requireSquadAdmin(req, res, squadId);
    if (!session) return;

    const { name, email, initialScore } = req.body;

    if (!name || !email || initialScore === undefined || initialScore <= 0) {
      return res.status(400).json({ message: 'Name, email and initial score are required' });
    }

    try {
      const player = await addPlayer(squadId, { name, email, initialScore: Number(initialScore) });
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
      const players = await getPlayers(squadId);
      res.status(200).json(players);
    } catch (error) {
      console.error('Players API Error:', error);
      res.status(500).json({ message: 'Failed to fetch players' });
    }
  }
}
