import { getPlayers } from '@/lib/ranking/players';
import { getAllEncounters } from '@/lib/ranking/encounters';
import { buildSquadRankingsResponse } from '@/lib/ranking/rankingResponse';
import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSquadId } from '@/lib/api/squadParam';

// Public - no login required (SQUAD_TENANCY_PLAN.md: the ranking board is the one page that was
// always public and stays that way).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  try {
    const [players, encounters] = await Promise.all([getPlayers(squadId), getAllEncounters(squadId)]);
    res.status(200).json(buildSquadRankingsResponse(players, encounters));
  } catch (error) {
    console.error('Rankings API Error:', error);
    res.status(500).json({ message: 'Failed to fetch rankings' });
  }
}
