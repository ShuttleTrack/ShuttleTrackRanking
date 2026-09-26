import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin, requireSuperAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { scheduleTimezone, type SquadScheduleData } from '@/lib/squadSchedule';
import { gameDayOpsToWire } from '@/lib/gameDayOps';
import { cancelOpenGameDays } from '@/lib/gameDay/lifecycle';
import { PlayerType } from '@prisma/client';
import { countPendingJoinRequests } from '@/lib/joinRequests';
import { recalculatePublicRatingsSafely } from '@/lib/ranking/publicRatingRecalc';

// GET: squad settings (enabled, maxPlayers, publicWeight, current roster size) - visible to that
// squad's own admins, not just a superadmin, since they need to see the cap even though only a
// superadmin can change it. PATCH: change enabled/maxPlayers/publicWeight - superadmin only.
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
      const [squad, playerCount, fulltimePlayerCount, pendingJoinRequestCount] = await Promise.all([
        prisma.squad.findUniqueOrThrow({ where: { id: squadId } }),
        prisma.player.count({ where: { squadId } }),
        // maxPlayers caps the FULLTIME roster only (SELF_REGISTRATION_PLAN.md), so this is the
        // number the settings/dashboard readouts compare against it. playerCount above is the
        // whole roster, shown as its own figure - rendering a total against a fulltime-only cap
        // would misreport how full a squad is.
        prisma.player.count({ where: { squadId, playerType: PlayerType.FULLTIME } }),
        // Feeds the dashboard's pending-requests badge. One more count on a payload this page
        // already loads, rather than a second SWR hook. The admin Telegram group
        // (lib/adminNotifications.ts) is optional, so the badge is still the one signal every
        // squad gets that requests are waiting.
        countPendingJoinRequests(squadId),
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
        fulltimePlayerCount,
        pendingJoinRequestCount,
        isPublic: squad.isPublic,
        publicWeight: squad.publicWeight,
        openForOpenSlot: squad.openForOpenSlot,
        isRecurring: schedule?.isRecurring ?? false,
        scheduleDayOfWeek: schedule?.dayOfWeek ?? null,
        scheduleStartTime: schedule?.startTime ?? null,
        scheduleEndTime: schedule?.endTime ?? null,
        scheduleStartDate: schedule?.startDate ?? null,
        scheduleEndDate: schedule?.endDate ?? null,
        scheduleSkipDates: schedule?.skipDates ?? [],
        scheduleTimezone: scheduleTimezone(schedule),
        openSlotAbsenteeGraceDays: squad.openSlotAbsenteeGraceDays,
        openSlotVisibilityGameDays: squad.openSlotVisibilityGameDays,
        // Squad.gameDayOps unpacked the same way (ATTENDANCE_VOTE_PLAN.md).
        ...gameDayOpsToWire(squad.gameDayOps),
        adminTelegramChatId: squad.adminTelegramChatId,
      });
    } catch (error) {
      console.error('Get Squad API Error:', error);
      res.status(500).json({ message: 'Failed to fetch squad' });
    }
  } else if (req.method === 'PATCH') {
    const session = await requireSuperAdmin(req, res);
    if (!session) return;

    const { enabled, maxPlayers, publicWeight } = req.body;
    const data: { enabled?: boolean; maxPlayers?: number | null; publicWeight?: number } = {};
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    if (maxPlayers !== undefined) {
      if (maxPlayers !== null && (!Number.isInteger(maxPlayers) || maxPlayers < 1)) {
        return res.status(400).json({ message: 'maxPlayers must be a positive integer or null (unlimited)' });
      }
      data.maxPlayers = maxPlayers;
    }
    if (publicWeight !== undefined) {
      if (typeof publicWeight !== 'number' || !Number.isFinite(publicWeight) || publicWeight < 0 || publicWeight > 1) {
        return res.status(400).json({ message: 'publicWeight must be a number from 0 to 1' });
      }
      data.publicWeight = publicWeight;
    }

    try {
      const squad = await prisma.squad.update({ where: { id: squadId }, data });
      // A disabled squad's open game-day votes must not be left accepting votes that nothing
      // closes - the same cancellation turning gameDayOps off performs, from this (different)
      // handler (ATTENDANCE_VOTE_PLAN.md, "Disabling a squad must not strand open rows").
      if (data.enabled === false) {
        await cancelOpenGameDays(squadId, 'The squad was disabled.');
      }
      if (data.enabled !== undefined || data.publicWeight !== undefined) {
        await recalculatePublicRatingsSafely(`squad ${squadId} settings changed`);
      }
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
