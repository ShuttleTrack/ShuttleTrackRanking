import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { getSecurePlayers } from '@/lib/ranking/players';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await requireAuth(req, res);
  if (!session) return;

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  try {
    const players = await getSecurePlayers(status);
    res.status(200).json(players);
  } catch (error) {
    console.error('Admin Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch players' });
  }
}