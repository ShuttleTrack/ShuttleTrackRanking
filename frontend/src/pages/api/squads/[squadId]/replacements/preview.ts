import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { getSquadAccess } from '@/lib/auth/squadAccess';
import { previewReplacementWindow } from '@/lib/replacements';
import { parseSquadId } from '@/lib/api/squadParam';

// Lets the nomination form show "2 playing days selected, need 3" (and which dates those are)
// before the user submits, running the *same* window validation the create route enforces
// (OPEN_SLOT_PLAYERS_PLAN.md). A dedicated endpoint rather than handing the squad's schedule to
// the client: GET /api/squads/[squadId] is squad-admin-only, and a regular player has no reason
// to receive the whole recurrence blob just to count days.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { player, isSquadAdmin } = await getSquadAccess(session.user.email, squadId);
  if (!player && !isSquadAdmin && !session.user.isSuperAdmin) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { startDate, endDate } = req.query;
  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    return res.status(400).json({ message: 'startDate and endDate are required' });
  }

  try {
    // previewReplacementWindow returns validation failures as data (the form renders them), so a
    // throw here is a genuine server fault, not a bad date range.
    res.status(200).json(await previewReplacementWindow(squadId, startDate, endDate));
  } catch (error) {
    console.error('Replacement Preview API Error:', error);
    res.status(500).json({ message: 'Failed to preview the replacement window' });
  }
}
