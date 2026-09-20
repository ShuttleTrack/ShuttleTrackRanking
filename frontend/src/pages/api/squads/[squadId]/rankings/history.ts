import type { NextApiRequest, NextApiResponse } from 'next';
import { getRankingHistory } from '@/services/rankingHistoryService';
import type { RankingHistoryData } from '@/types/rankings';
import { parseSquadId } from '@/lib/api/squadParam';

// Public - no login required (SQUAD_TENANCY_PLAN.md: ranking history is part of the public board).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RankingHistoryData[] | { message: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  try {
    const data = await getRankingHistory(squadId);
    res.status(200).json(data);
  } catch (error) {
    console.error('Ranking History API Error:', error);
    res.status(500).json({ message: 'Failed to fetch ranking history' });
  }
}
