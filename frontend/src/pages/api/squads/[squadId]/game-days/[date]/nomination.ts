import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadMember } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { resolveGameDayParam } from '@/lib/api/gameDayParam';
import { isValidationError } from '@/lib/api/validationError';
import { loadGameDayState } from '@/lib/gameDay/eligibility';
import { nominate, nominationCandidates, nominationVerdict, revokeNomination } from '@/lib/gameDay/nominations';
import { maskEmail } from '@/lib/replacements';

// One-day slot nominations (SINGLE_DAY_NOMINATION_PLAN.md), for the caller's own slot:
//   GET ?query=  - who they could pass it to: this game day's open-slot pool, as
//                  { id, name, maskedEmail } exactly like the period-replacement picker
//                  (searchOpenSlotPlayers) - this route is open to any squad member, so it never
//                  returns a real address.
//   PUT { nomineePlayerId } - pass the slot on, or switch who to.
//   DELETE       - take it back.
// The NOMINATOR always comes from the session (requireSquadMember -> getSquadAccess), never the
// body. nomineePlayerId is the object of the action, not an identity: naming yourself as the
// nominee of someone else's slot does nothing, because you, as the session player, are not the
// fulltime holder of that slot.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const member = await requireSquadMember(req, res, squadId);
  if (!member) return;
  if (!member.player) {
    return res.status(403).json({ message: 'Only a player in this squad can pass their slot on' });
  }
  const playerId = member.player.id;

  try {
    const gameDay = await resolveGameDayParam(req, res, squadId);
    if (!gameDay) return;

    if (req.method === 'GET') {
      const state = await loadGameDayState(prisma, gameDay);
      const verdict = nominationVerdict(state, playerId, new Date());
      if (!verdict.ok) {
        return res.status(400).json({ message: verdict.reason });
      }
      const query = typeof req.query.query === 'string' ? req.query.query : '';
      return res.status(200).json(
        nominationCandidates(state, query).map((p) => ({ id: p.id, name: p.name, maskedEmail: maskEmail(p.email) }))
      );
    }

    if (req.method === 'PUT') {
      const nomineePlayerId = req.body?.nomineePlayerId;
      if (!Number.isInteger(nomineePlayerId)) {
        return res.status(400).json({ message: 'nomineePlayerId is required' });
      }
      const nomination = await nominate(squadId, gameDay.id, playerId, nomineePlayerId);
      return res.status(200).json({ nomineePlayerId: nomination.nomineePlayerId });
    }

    await revokeNomination(squadId, gameDay.id, playerId);
    return res.status(204).end();
  } catch (error) {
    if (isValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Slot Nomination API Error:', error);
    res.status(500).json({ message: 'Failed to update your slot hand-off' });
  }
}
