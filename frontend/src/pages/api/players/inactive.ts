import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlayers } from '@/lib/ranking/players';
import { requireAuth } from '@/lib/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Require authentication for inactive players
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const players = await getPlayers('inactive');
    res.status(200).json(players);
  } catch (error) {
    console.error('Inactive Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch inactive players' });
  }
} 