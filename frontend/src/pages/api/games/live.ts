import type { NextApiRequest, NextApiResponse } from 'next';
import { getPublicLiveGames } from '@/lib/games/liveGames';

// Public - no login required. In-progress games of enabled + isPublic squads, for the live strip
// on the site-root board at /. Private squads are excluded here, same as from GET /api/rankings.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const games = await getPublicLiveGames();
    res.status(200).json(games);
  } catch (error) {
    console.error('Public Live Games API Error:', error);
    res.status(500).json({ message: 'Failed to fetch live games' });
  }
}
