import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSquadMember } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { resolveGameDayParam } from '@/lib/api/gameDayParam';
import { getGameDayView } from '@/lib/gameDay/view';

// GET: one game day as the caller sees it - the snapshot, status, their role and vote, which
// actions they may take, and (unless they are a voter who has not voted yet) the roster.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const member = await requireSquadMember(req, res, squadId);
  if (!member) return;

  try {
    const gameDay = await resolveGameDayParam(req, res, squadId);
    if (!gameDay) return;
    res.status(200).json(await getGameDayView(gameDay, member.player));
  } catch (error) {
    console.error('Get Game Day API Error:', error);
    res.status(500).json({ message: 'Failed to load the game day' });
  }
}
