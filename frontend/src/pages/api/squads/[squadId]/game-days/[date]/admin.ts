import type { NextApiRequest, NextApiResponse } from 'next';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { resolveGameDayParam } from '@/lib/api/gameDayParam';
import { isValidationError } from '@/lib/api/validationError';
import { isoFromDateOnly } from '@/lib/gameDay/clock';
import { cancelGameDay, closeVoting, releaseSlot } from '@/lib/gameDay/lifecycle';
import { getGameDayAttendance } from '@/lib/gameDay/view';
import type { SquadScheduleData } from '@/lib/squadSchedule';

// Squad-admin only. GET: full attendance for Game Planner (the confirmed players to pre-tick, and
// the unconfirmed and post-deadline dropouts for its banner). PATCH { action }:
//   close   - close voting now, through the same close-and-sync path as the 13:00 cron.
//   cancel  - cancel the session. Also adds the date to the schedule's skipDates, so the
//             scheduler does not simply re-create it on its next tick; removing the skip date
//             later re-creates it as a brand-new vote.
//   release - { playerId } free one player's slot (the only way out of an unconfirmed DIRECT
//             claim). The one deliberate exception to "identity never comes from the body": this
//             IS an admin acting on another player. The actor still comes from the session.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!(await requireSquadAdmin(req, res, squadId))) return;

  try {
    const gameDay = await resolveGameDayParam(req, res, squadId);
    if (!gameDay) return;

    if (req.method === 'GET') {
      return res.status(200).json(await getGameDayAttendance(gameDay));
    }

    const { action, playerId, reason } = req.body ?? {};
    if (action === 'close') {
      if (gameDay.status !== 'VOTING_OPEN') {
        return res.status(400).json({ message: 'Voting is not open on this game day' });
      }
      await closeVoting(gameDay.id);
    } else if (action === 'cancel') {
      if (gameDay.status === 'CANCELLED') {
        return res.status(400).json({ message: 'This game day is already cancelled' });
      }
      const squad = await prisma.squad.findUniqueOrThrow({ where: { id: squadId } });
      const schedule = squad.schedule as SquadScheduleData | null;
      const date = isoFromDateOnly(gameDay.gameDate);
      if (schedule?.isRecurring && !(schedule.skipDates ?? []).includes(date)) {
        const next: SquadScheduleData = { ...schedule, skipDates: [...(schedule.skipDates ?? []), date].sort() };
        await prisma.squad.update({
          where: { id: squadId },
          data: { schedule: next as unknown as Prisma.InputJsonValue },
        });
      }
      await cancelGameDay(
        gameDay.id,
        typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : 'Cancelled by a squad admin.'
      );
    } else if (action === 'release') {
      if (!Number.isInteger(playerId)) {
        return res.status(400).json({ message: 'release needs a playerId' });
      }
      await releaseSlot(squadId, gameDay.id, playerId);
    } else {
      return res.status(400).json({ message: "action must be 'close', 'cancel' or 'release'" });
    }

    const updated = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } });
    res.status(200).json(await getGameDayAttendance(updated));
  } catch (error) {
    if (isValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Game Day Admin API Error:', error);
    res.status(500).json({ message: 'Failed to update the game day' });
  }
}
