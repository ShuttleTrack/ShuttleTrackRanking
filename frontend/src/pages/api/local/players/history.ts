import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllPlayersHistory, HistoryType } from '@/lib/ranking/players';

const VALID_TYPES: HistoryType[] = ['RANK', 'SCORE', 'ALL'];

// Local port of GET /players/history?type=. Parallel to the existing BE-proxying routes.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const typeParam = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : 'RANK';
  if (!VALID_TYPES.includes(typeParam as HistoryType)) {
    return res.status(400).json({ message: `Invalid type: ${typeParam}` });
  }

  try {
    const history = await getAllPlayersHistory(typeParam as HistoryType);
    res.status(200).json(history);
  } catch (error) {
    console.error('Local Players History API Error:', error);
    res.status(500).json({ message: 'Failed to fetch players history' });
  }
}
