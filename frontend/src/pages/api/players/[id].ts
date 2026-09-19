import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { updatePlayer } from '@/lib/ranking/players';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  try {
    const player = await updatePlayer({ id: Number(id), name, email });
    res.status(200).json(player);
  } catch (error) {
    console.error('Update Player API Error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to update player'
    });
  }
}