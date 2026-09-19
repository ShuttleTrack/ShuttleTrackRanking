import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlayerHistory, HistoryType } from '@/lib/ranking/players';

const VALID_TYPES: HistoryType[] = ['RANK', 'SCORE', 'ALL'];

// Local port of GET /players/{playerId}/history?type=.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const playerId = Number(req.query.id);
  if (!Number.isInteger(playerId)) {
    return res.status(400).json({ message: `Invalid playerId: ${req.query.id}` });
  }

  const typeParam = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : 'RANK';
  if (!VALID_TYPES.includes(typeParam as HistoryType)) {
    return res.status(400).json({ message: `Invalid type: ${typeParam}` });
  }

  try {
    const history = await getPlayerHistory(playerId, typeParam as HistoryType);
    res.status(200).json(history);
  } catch (error) {
    console.error('Local Player History API Error:', error);
    res.status(500).json({ message: 'Failed to fetch player history' });
  }
}
