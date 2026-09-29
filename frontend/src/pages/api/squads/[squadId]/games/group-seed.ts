import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { dailyGroupSeed } from '@/lib/games/groupSeed';
import { scheduleTimezone, type SquadScheduleData } from '@/lib/squadSchedule';

// Today's group-ordering seed for this squad (lib/games/groupSeed.ts).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) {
    return;
  }

  try {
    const squad = await prisma.squad.findUnique({ where: { id: squadId }, select: { schedule: true } });
    if (!squad) return res.status(404).json({ message: 'Squad not found' });
    const timezone = scheduleTimezone(squad.schedule as SquadScheduleData | null);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ seed: dailyGroupSeed(squadId, timezone) });
  } catch (error) {
    console.error('Group Seed API Error:', error);
    res.status(500).json({ message: 'Failed to fetch the group seed' });
  }
}
