import type { NextApiRequest, NextApiResponse } from 'next';
import { assignInitialScores } from '@/lib/ranking/players';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

interface AssignmentBody {
  playerId: number;
  rankScore: number;
}

// OPEN_SLOT_PLAYERS_PLAN.md: gives a batch of scoreless players (open-slot admin-add, future
// self-registration) their first rank score in one action - the friendly path to satisfying the
// authoritative gate in the game-create route, not a gate itself.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { assignments } = req.body as { assignments?: AssignmentBody[] };
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ message: 'At least one assignment is required' });
  }
  for (const a of assignments) {
    if (typeof a?.playerId !== 'number' || typeof a?.rankScore !== 'number' || a.rankScore <= 0) {
      return res.status(400).json({ message: 'Each assignment needs a playerId and a rankScore greater than 0' });
    }
  }

  try {
    await assignInitialScores(squadId, assignments);
    res.status(200).json({ message: 'Scores assigned' });
  } catch (error) {
    console.error('Bulk Initial Score API Error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to assign scores',
    });
  }
}
