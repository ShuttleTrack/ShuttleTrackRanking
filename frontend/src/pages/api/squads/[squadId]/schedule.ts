import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { validateScheduleInput } from '@/lib/squadSchedule';

// Editable by the squad's own admins (not superadmin-only, unlike enabled/maxPlayers on
// /api/squads/[squadId] - see SQUAD_TENANCY_PLAN.md follow-up notes on schedule.ts).
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

  const result = validateScheduleInput(req.body);
  if ('error' in result) {
    return res.status(400).json({ message: result.error });
  }

  try {
    const squad = await prisma.squad.update({ where: { id: squadId }, data: result.data });
    res.status(200).json(squad);
  } catch (error) {
    console.error('Update Squad Schedule API Error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to update squad schedule'
    });
  }
}
