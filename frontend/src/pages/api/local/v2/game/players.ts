import type { NextApiRequest, NextApiResponse } from 'next';
import { getAvailablePlayersForGame } from '@/lib/ranking/players';

// Local port of GET /v2/game/players.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const players = await getAvailablePlayersForGame();
    res.status(200).json(players);
  } catch (error) {
    console.error('Local Game Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch game players' });
  }
}
