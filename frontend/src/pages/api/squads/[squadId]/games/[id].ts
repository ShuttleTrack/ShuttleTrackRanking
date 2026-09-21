import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { findScorelessPlayersInGroups } from '@/lib/ranking/players';
import { isValidationError } from '@/lib/api/validationError';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) {
    return;
  }

  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ message: 'Invalid game ID' });
  }

  // Game ids are a globally-unique cuid sequence shared across all squads, so every method here
  // confirms the row actually belongs to this squad before acting on it.
  const existing = await prisma.game.findUnique({ where: { id } });
  if (!existing || existing.squadId !== squadId) {
    return res.status(404).json({ message: 'Game not found' });
  }

  if (req.method === 'GET') {
    res.status(200).json(existing);
  } else if (req.method === 'PUT') {
    try {
      const { groups, scores, status } = req.body;
      if (groups) {
        const scoreless = await findScorelessPlayersInGroups(squadId, groups);
        if (scoreless.length > 0) {
          return res.status(400).json({
            message: `These players need a rank score before a game day can be created: ${scoreless.map((p) => p.name).join(', ')}`,
            scorelessPlayers: scoreless,
          });
        }
      }
      const game = await prisma.game.update({
        where: { id },
        data: {
          groups,
          scores,
          status
        }
      });
      res.status(200).json(game);
    } catch (error) {
      // A player id that is not in this squad is a bad request, not a server fault.
      if (isValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }
      console.error('Update Game API Error:', error);
      res.status(500).json({ message: 'Failed to update game' });
    }
  } else if (req.method === 'DELETE') {
    try {
      await prisma.game.delete({
        where: { id }
      });
      res.status(200).json({ message: 'Game deleted successfully' });
    } catch (error) {
      console.error('Delete Game API Error:', error);
      res.status(500).json({ message: 'Failed to delete game' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
