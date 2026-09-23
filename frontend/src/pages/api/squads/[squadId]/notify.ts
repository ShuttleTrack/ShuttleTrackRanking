import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { buildGameMessage, isGameEvent } from '@/lib/gameNotifications';
import { logSend, sendGameDayPost } from '@/lib/gameDay/telegram';

// POST { event: 'started' | 'completed' | 'cancelled', gameId } - the score keeper's Telegram
// post to this squad's main group (gameDayOps.telegramMainChatId), squad admins. The server
// builds the text and links; the client only names the event. The game row is not looked up:
// 'cancelled' fires after the row is deleted, 'completed' just before.
//
// A squad with no main chat id configured is a 200 with status 'skipped', not an error - there
// is simply nowhere to post.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) return;

  const { event, gameId } = req.body ?? {};
  if (!isGameEvent(event)) {
    return res.status(400).json({ message: 'event must be "started", "completed" or "cancelled"' });
  }
  if (typeof gameId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(gameId)) {
    return res.status(400).json({ message: 'Invalid game id' });
  }

  try {
    const squad = await prisma.squad.findUnique({ where: { id: squadId } });
    if (!squad) {
      return res.status(404).json({ message: 'Squad not found' });
    }

    const message = buildGameMessage(event, {
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
      squadName: squad.name,
      slug: squad.slug,
      gameId,
    });
    const outcome = await sendGameDayPost(squad, 'main', message);
    logSend(squad, `game ${event} notification`, outcome);

    if (outcome.status === 'failed') {
      return res.status(502).json({ message: `Failed to send notification: ${outcome.reason}` });
    }
    res.status(200).json(outcome);
  } catch (error) {
    console.error('Notify API Error:', error);
    res.status(500).json({ message: 'Failed to send notification' });
  }
}
