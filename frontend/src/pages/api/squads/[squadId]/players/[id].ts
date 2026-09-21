import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSquadAdmin } from '@/lib/auth';
import { updatePlayer } from '@/lib/ranking/players';
import { parseSquadId } from '@/lib/api/squadParam';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const session = await requireSquadAdmin(req, res, squadId);
  if (!session) return;

  const { id } = req.query;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  try {
    const player = await updatePlayer(squadId, { id: Number(id), name, email });
    res.status(200).json(player);
  } catch (error) {
    console.error('Update Player API Error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to update player'
    });
  }
}
