import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { getSquadAccess } from '@/lib/auth/squadAccess';
import {
  createSlotReplacement,
  listSlotReplacementsForSquad,
  listSlotReplacementsForFulltimePlayer,
} from '@/lib/replacements';
import { parseSquadId } from '@/lib/api/squadParam';

// GET: returns the caller's *own* nominations by default, whoever they are. `?scope=squad` asks
// for every replacement in the squad (read-only admin oversight) and is rejected for anyone who
// isn't a squad admin. The scope is explicit rather than inferred from the caller's role on
// purpose: the player-facing page renders this list as "Your replacements" with a Cancel button
// per row, and a squad admin who is also a player would otherwise be shown - and invited to
// cancel - every other member's nomination, which `requestCancelReplacementCancellation` then refuses.
// POST: self-service creation - no admin approval, just the guardrails in lib/replacements.ts
// (own slot only, nominee must be open-slot, schedule configured, >= 3 playing days, no overlap).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { player, isSquadAdmin } = await getSquadAccess(session.user.email, squadId);
  const isAdmin = isSquadAdmin || Boolean(session.user.isSuperAdmin);
  if (!player && !isAdmin) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const wantsSquadScope = req.query.scope === 'squad';
    if (wantsSquadScope && !isAdmin) {
      return res.status(403).json({ message: 'Only a squad admin can list the whole squad\'s replacements' });
    }
    if (!wantsSquadScope && !player) {
      // A superadmin with no Player row in this squad has no "own" list to return.
      return res.status(200).json([]);
    }

    try {
      const replacements = wantsSquadScope
        ? await listSlotReplacementsForSquad(squadId)
        : await listSlotReplacementsForFulltimePlayer(squadId, player!.id);
      res.status(200).json(replacements);
    } catch (error) {
      console.error('List Replacements API Error:', error);
      res.status(500).json({ message: 'Failed to load replacements' });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!player) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { replacementPlayerId, startDate, endDate } = req.body;
    if (
      typeof replacementPlayerId !== 'number' ||
      typeof startDate !== 'string' ||
      typeof endDate !== 'string'
    ) {
      return res.status(400).json({ message: 'replacementPlayerId, startDate and endDate are required' });
    }

    try {
      const replacement = await createSlotReplacement(squadId, {
        fulltimePlayerId: player.id,
        replacementPlayerId,
        startDate,
        endDate,
        createdByEmail: session.user.email,
      });
      res.status(201).json(replacement);
    } catch (error) {
      console.error('Create Replacement API Error:', error);
      res.status(400).json({
        message: error instanceof Error ? error.message : 'Failed to create replacement',
      });
    }
    return;
  }

  res.status(405).json({ message: 'Method not allowed' });
}
