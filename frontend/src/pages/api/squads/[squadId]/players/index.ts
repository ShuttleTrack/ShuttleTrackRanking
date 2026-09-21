import type { NextApiRequest, NextApiResponse } from 'next';
import { PlayerType } from '@prisma/client';
import { getPlayers, addPlayer } from '@/lib/ranking/players';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

// GET is public (the roster is part of the public ranking board); POST requires squad-admin.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (req.method === 'POST') {
    const session = await requireSquadAdmin(req, res, squadId);
    if (!session) return;

    const { name, email, initialScore, playerType } = req.body;

    if (playerType !== undefined && playerType !== PlayerType.FULLTIME && playerType !== PlayerType.OPEN_SLOT) {
      return res.status(400).json({ message: `Invalid playerType: ${playerType}` });
    }
    const resolvedType: PlayerType = playerType ?? PlayerType.FULLTIME;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    // FULLTIME still always needs a score up front (unchanged); OPEN_SLOT may be added without
    // one (OPEN_SLOT_PLAYERS_PLAN.md) and gets one later via the game-planner's bulk-assign step.
    if (resolvedType === PlayerType.FULLTIME && (initialScore === undefined || Number(initialScore) <= 0)) {
      return res.status(400).json({ message: 'Initial score is required for a fulltime player' });
    }
    if (initialScore !== undefined && Number(initialScore) <= 0) {
      return res.status(400).json({ message: 'Initial score must be greater than 0' });
    }

    try {
      const player = await addPlayer(squadId, {
        name,
        email,
        playerType: resolvedType,
        initialScore: initialScore !== undefined ? Number(initialScore) : undefined,
      });
      res.status(201).json(player);
    } catch (error) {
      console.error('Create Player API Error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to create player'
      });
    }
  } else {
    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
      const players = await getPlayers(squadId);
      res.status(200).json(players);
    } catch (error) {
      console.error('Players API Error:', error);
      res.status(500).json({ message: 'Failed to fetch players' });
    }
  }
}
