import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSquadMember } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { resolveGameDayParam } from '@/lib/api/gameDayParam';
import { isValidationError } from '@/lib/api/validationError';
import { castVote } from '@/lib/gameDay/votes';

// PUT { choice: 'IN' | 'OUT' }. The acting player is resolved from the session
// (requireSquadMember -> getSquadAccess), NEVER from the body - the body carries `choice` and
// nothing else, and any identity in it is ignored (ATTENDANCE_VOTE_PLAN.md, "The identity rule").
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const member = await requireSquadMember(req, res, squadId);
  if (!member) return;
  if (!member.player) {
    return res.status(403).json({ message: 'Only a player in this squad can vote - an admin without a roster entry cannot' });
  }

  const choice = req.body?.choice;
  if (choice !== 'IN' && choice !== 'OUT') {
    return res.status(400).json({ message: "choice must be 'IN' or 'OUT'" });
  }

  try {
    const gameDay = await resolveGameDayParam(req, res, squadId);
    if (!gameDay) return;
    const vote = await castVote(squadId, gameDay.id, member.player.id, choice);
    res.status(200).json({ choice: vote.choice });
  } catch (error) {
    if (isValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Cast Vote API Error:', error);
    res.status(500).json({ message: 'Failed to record your vote' });
  }
}
