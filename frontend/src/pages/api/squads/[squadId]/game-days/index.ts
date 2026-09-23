import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSquadMember } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { listUpcomingGameDays } from '@/lib/gameDay/view';

// GET: this squad's upcoming game days (session not yet ended, not cancelled) with the caller's
// own vote/slot state on each - feeds the profile page's list and the Check-in tab.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const member = await requireSquadMember(req, res, squadId);
  if (!member) return;

  try {
    res.status(200).json(await listUpcomingGameDays(squadId, member.player));
  } catch (error) {
    console.error('List Game Days API Error:', error);
    res.status(500).json({ message: 'Failed to load game days' });
  }
}
