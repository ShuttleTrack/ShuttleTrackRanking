import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSquadMember } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { resolveGameDayParam } from '@/lib/api/gameDayParam';
import { isValidationError } from '@/lib/api/validationError';
import { joinOpenSlot, leaveOpenSlot } from '@/lib/gameDay/openSlots';

// POST: join the waiting list (voting open) or claim a slot directly (voting closed).
// DELETE: leave the waiting list - giving up an ASSIGNED slot is PUT vote { OUT } instead.
// Neither carries a body: the acting player comes from the session only.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const member = await requireSquadMember(req, res, squadId);
  if (!member) return;
  if (!member.player) {
    return res.status(403).json({ message: 'Only a player in this squad can take an open slot' });
  }

  try {
    const gameDay = await resolveGameDayParam(req, res, squadId);
    if (!gameDay) return;
    if (req.method === 'POST') {
      const entry = await joinOpenSlot(squadId, gameDay.id, member.player.id);
      return res.status(200).json({ status: entry.status, source: entry.source });
    }
    await leaveOpenSlot(squadId, gameDay.id, member.player.id);
    res.status(204).end();
  } catch (error) {
    if (isValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Open Slot API Error:', error);
    res.status(500).json({ message: 'Failed to update your open slot' });
  }
}
