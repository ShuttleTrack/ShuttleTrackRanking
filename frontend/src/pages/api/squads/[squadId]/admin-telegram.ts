import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { normaliseChatId } from '@/lib/gameDayOps';

// PATCH the squad's admin Telegram group (Squad.adminTelegramChatId) - squad admins, like
// visibility.ts. Body: `{ adminTelegramChatId }`; blank or null clears it. Independent of
// game-day check-in: join requests and replacements post here whether check-in is on or not.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) return;

  const adminTelegramChatId = normaliseChatId(req.body?.adminTelegramChatId);
  if (adminTelegramChatId === undefined) {
    return res.status(400).json({
      message: 'The admin group chat id must be a numeric Telegram chat id (e.g. -1001234567890) or an @channel name',
    });
  }

  try {
    const squad = await prisma.squad.update({ where: { id: squadId }, data: { adminTelegramChatId } });
    res.status(200).json({ adminTelegramChatId: squad.adminTelegramChatId });
  } catch (error) {
    console.error('Update Admin Telegram API Error:', error);
    res.status(500).json({ message: 'Failed to update the admin group chat id' });
  }
}
