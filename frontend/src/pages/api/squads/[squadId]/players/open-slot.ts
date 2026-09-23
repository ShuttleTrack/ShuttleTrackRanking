import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSquadMember } from '@/lib/auth';
import { searchOpenSlotPlayers } from '@/lib/replacements';
import { parseSquadId } from '@/lib/api/squadParam';

// Name-or-email search for the self-service replacement nomination picker. Gated to signed-in
// squad members (any player, not just admins) rather than public - this is roster search, not
// the public ranking board.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadMember(req, res, squadId))) return;

  const query = typeof req.query.query === 'string' ? req.query.query : '';

  try {
    const players = await searchOpenSlotPlayers(squadId, query);
    res.status(200).json(players);
  } catch (error) {
    console.error('Open Slot Search API Error:', error);
    res.status(500).json({ message: 'Failed to search open-slot players' });
  }
}
