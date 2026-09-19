import type { NextApiRequest, NextApiResponse } from 'next';
import { getAvailablePlayersForGame } from '@/lib/ranking/players';
import { requireAuth } from '@/lib/auth';

// Local port of GET /v2/game/players. Guarded with requireAuth - matches SecurityConfig.java's
// `GET /v2/game/**` requiring authentication, and the existing pages/api/game/players.ts proxy.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const players = await getAvailablePlayersForGame();
    res.status(200).json(players);
  } catch (error) {
    console.error('Local Game Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch game players' });
  }
}
