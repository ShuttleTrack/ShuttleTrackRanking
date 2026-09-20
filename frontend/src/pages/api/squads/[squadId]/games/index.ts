import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) {
    return;
  }

  if (req.method === 'POST') {
    try {
      const { groups } = req.body;
      const game = await prisma.game.create({
        data: {
          squadId,
          groups,
          scores: {},
          status: 'DRAFT'
        }
      });
      res.status(201).json(game);
    } catch (error) {
      res.status(500).json({ message: 'Failed to create game' });
    }
  } else if (req.method === 'GET') {
    try {
      const games = await prisma.game.findMany({
        where: { squadId },
        orderBy: {
          createdAt: 'desc'
        }
      });
      res.status(200).json(games);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch games' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
