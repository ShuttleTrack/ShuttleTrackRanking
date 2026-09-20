import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlayers } from '@/lib/ranking/players';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const session = await requireSquadAdmin(req, res, squadId);
  if (!session) return;

  try {
    const players = await getPlayers(squadId, 'inactive');
    res.status(200).json(players);
  } catch (error) {
    console.error('Inactive Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch inactive players' });
  }
}
