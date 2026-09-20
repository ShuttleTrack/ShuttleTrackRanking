import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

// Editable by the squad's own admins (not superadmin-only, unlike enabled/maxPlayers on
// /api/squads/[squadId]) - see the isPublic comment in schema.prisma. No behavioral difference
// yet; reserved for a future public squad directory.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const session = await requireSquadAdmin(req, res, squadId);
  if (!session) return;

  const { isPublic } = req.body;
  if (typeof isPublic !== 'boolean') {
    return res.status(400).json({ message: 'isPublic must be a boolean' });
  }

  try {
    const squad = await prisma.squad.update({ where: { id: squadId }, data: { isPublic } });
    res.status(200).json(squad);
  } catch (error) {
    console.error('Update Squad Visibility API Error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to update squad visibility'
    });
  }
}
