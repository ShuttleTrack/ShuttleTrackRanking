import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

// Editable by the squad's own admins (not superadmin-only, matching schedule.ts/visibility.ts -
// unlike enabled/maxPlayers on the squad index route). OPEN_SLOT_PLAYERS_PLAN.md: these are two
// independent settings ("stop penalizing" vs "stop displaying"), never locked together.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const session = await requireSquadAdmin(req, res, squadId);
  if (!session) return;

  const { openSlotAbsenteeGraceDays, openSlotVisibilityGameDays } = req.body;
  const data: { openSlotAbsenteeGraceDays?: number; openSlotVisibilityGameDays?: number } = {};

  if (openSlotAbsenteeGraceDays !== undefined) {
    if (!Number.isInteger(openSlotAbsenteeGraceDays) || openSlotAbsenteeGraceDays < 0) {
      return res.status(400).json({ message: 'openSlotAbsenteeGraceDays must be a non-negative integer' });
    }
    data.openSlotAbsenteeGraceDays = openSlotAbsenteeGraceDays;
  }
  if (openSlotVisibilityGameDays !== undefined) {
    if (!Number.isInteger(openSlotVisibilityGameDays) || openSlotVisibilityGameDays < 0) {
      return res.status(400).json({ message: 'openSlotVisibilityGameDays must be a non-negative integer' });
    }
    data.openSlotVisibilityGameDays = openSlotVisibilityGameDays;
  }

  try {
    const squad = await prisma.squad.update({ where: { id: squadId }, data });
    res.status(200).json(squad);
  } catch (error) {
    console.error('Update Open Slot Settings API Error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to update open-slot settings',
    });
  }
}
