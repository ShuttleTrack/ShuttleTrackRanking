import type { NextApiRequest, NextApiResponse } from 'next';
import { updatePlayerRanking } from '@/lib/ranking/scorePersister';
import { toRawPlayerJson } from '@/lib/ranking/players';

// Local port of POST /v2/players/update-ranking. Returns the raw updated Player entities, same
// as the real backend (see toRawPlayerJson for why this includes derived boolean fields).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const updated = await updatePlayerRanking();
    res.status(200).json(updated.map(toRawPlayerJson));
  } catch (error) {
    console.error('Local Update Ranking API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update ranking' });
  }
}
