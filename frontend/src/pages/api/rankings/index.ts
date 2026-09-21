import type { NextApiRequest, NextApiResponse } from 'next';
import { getPublicRankings } from '@/lib/ranking/publicRankings';

// Public aggregate board at / — no login required.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const response = await getPublicRankings();
    res.status(200).json(response);
  } catch (error) {
    console.error('Public Rankings API Error:', error);
    res.status(500).json({ message: 'Failed to fetch public rankings' });
  }
}
