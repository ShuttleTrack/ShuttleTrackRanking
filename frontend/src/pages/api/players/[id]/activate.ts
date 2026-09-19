import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { activatePlayer } from '@/lib/ranking/scorePersister';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;

  try {
    // This route never sent a body, so it always used the auto-calculated score path (never
    // an explicit re-activation score) - preserved exactly.
    await activatePlayer(Number(id), null);
    res.status(200).json({ message: 'Player activated successfully' });
  } catch (error) {
    console.error('Activate Player API Error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to activate player'
    });
  }
}