import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { getSecurePlayers } from '@/lib/ranking/players';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const session = await requireSquadAdmin(req, res, squadId);
  if (!session) return;

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  try {
    const players = await getSecurePlayers(squadId, status);
    res.status(200).json(players);
  } catch (error) {
    console.error('Admin Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch players' });
  }
}
