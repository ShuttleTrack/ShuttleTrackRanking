import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) {
    return;
  }

  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ message: 'Invalid game ID' });
  }

  try {
    const existing = await prisma.game.findUnique({ where: { id } });
    if (!existing || existing.squadId !== squadId) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = await prisma.game.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS'
      }
    });

    res.status(200).json(game);
  } catch (error) {
    console.error('Start Game API Error:', error);
    res.status(500).json({ message: 'Failed to start game' });
  }
}
