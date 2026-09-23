import type { NextApiRequest, NextApiResponse } from 'next';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { gameDayOpsToWire, validateGameDayOpsInput } from '@/lib/gameDayOps';
import { cancelOpenGameDays } from '@/lib/gameDay/lifecycle';

// PATCH the squad's game-day check-in config (ATTENDANCE_VOTE_PLAN.md, Decision 9) - squad
// admins, like schedule.ts. validateGameDayOpsInput is the blob's only writer.
//
// Turning check-in OFF is an explicit action, not merely a flag the cron reads: it cancels every
// VOTING_OPEN game day in the same request (telling the main group where one was announced).
// Otherwise the scheduler, which no longer creates rows for the squad, would leave them
// accepting votes that nothing ever closes.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) return;

  const result = validateGameDayOpsInput(req.body ?? {});
  if ('error' in result) {
    return res.status(400).json({ message: result.error });
  }

  try {
    const squad = await prisma.squad.update({
      where: { id: squadId },
      data: { gameDayOps: result.data as unknown as Prisma.InputJsonValue },
    });
    const cancelledGameDays = result.data.enabled
      ? 0
      : await cancelOpenGameDays(squadId, 'Game-day check-in was turned off for this squad.');
    res.status(200).json({ ...gameDayOpsToWire(squad.gameDayOps), cancelledGameDays });
  } catch (error) {
    console.error('Update Game Day Ops API Error:', error);
    res.status(500).json({ message: 'Failed to update game-day check-in settings' });
  }
}
