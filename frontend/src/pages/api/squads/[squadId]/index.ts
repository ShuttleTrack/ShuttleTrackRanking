import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin, requireSuperAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import type { SquadScheduleData } from '@/lib/squadSchedule';

// GET: squad settings (enabled, maxPlayers, current roster size) - visible to that squad's own
// admins, not just a superadmin, since they need to see the cap even though only a superadmin
// can change it. PATCH: change enabled/maxPlayers - superadmin only.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (req.method === 'GET') {
    const session = await requireSquadAdmin(req, res, squadId);
    if (!session) return;

    try {
      const [squad, playerCount] = await Promise.all([
        prisma.squad.findUniqueOrThrow({ where: { id: squadId } }),
        prisma.player.count({ where: { squadId } }),
      ]);
      // Squad.schedule collapses every recurrence field into one JSON blob (see
      // lib/squadSchedule.ts) - unpacked back into the flat scheduleXxx field names here so the
      // wire format, and everything downstream of it (useSquadSettings, the settings page),
      // didn't need to change when the storage shape did.
      const schedule = squad.schedule as SquadScheduleData | null;
      res.status(200).json({
        id: squad.id,
        name: squad.name,
        slug: squad.slug,
        enabled: squad.enabled,
        maxPlayers: squad.maxPlayers,
        playerCount,
        isPublic: squad.isPublic,
        isRecurring: schedule?.isRecurring ?? false,
        scheduleDayOfWeek: schedule?.dayOfWeek ?? null,
        scheduleStartTime: schedule?.startTime ?? null,
        scheduleEndTime: schedule?.endTime ?? null,
        scheduleStartDate: schedule?.startDate ?? null,
        scheduleEndDate: schedule?.endDate ?? null,
        scheduleSkipDates: schedule?.skipDates ?? [],
        openSlotAbsenteeGraceDays: squad.openSlotAbsenteeGraceDays,
        openSlotVisibilityGameDays: squad.openSlotVisibilityGameDays,
      });
    } catch (error) {
      console.error('Get Squad API Error:', error);
      res.status(500).json({ message: 'Failed to fetch squad' });
    }
  } else if (req.method === 'PATCH') {
    const session = await requireSuperAdmin(req, res);
    if (!session) return;

    const { enabled, maxPlayers } = req.body;
    const data: { enabled?: boolean; maxPlayers?: number | null } = {};
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    if (maxPlayers !== undefined) {
      if (maxPlayers !== null && (!Number.isInteger(maxPlayers) || maxPlayers < 1)) {
        return res.status(400).json({ message: 'maxPlayers must be a positive integer or null (unlimited)' });
      }
      data.maxPlayers = maxPlayers;
    }

    try {
      const squad = await prisma.squad.update({ where: { id: squadId }, data });
      res.status(200).json(squad);
    } catch (error) {
      console.error('Update Squad API Error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to update squad'
      });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
