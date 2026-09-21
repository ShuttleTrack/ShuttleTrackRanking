import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '@/lib/auth';

// Manual test-send for the two Telegram group configs used by the Phase 6 scheduler
// (frontend/src/lib/telegram/scheduleConfig.ts) - lets an admin confirm each bot token/chat id
// pair actually works without waiting for the real 17:00 cron trigger. Not part of the ported
// backend surface; this is a debugging tool for this migration only.

type Group = 'wednesday' | 'friday';

const GROUP_CONFIG: Record<Group, { chatIdEnvVar: string; label: string }> = {
  // "Wednesday group" = the people who play on Wednesday. Their poll is actually sent on
  // Monday (asking about the upcoming Wednesday) using the existing TELEGRAM_CHAT_ID.
  wednesday: { chatIdEnvVar: 'TELEGRAM_CHAT_ID', label: 'Wednesday group (Monday poll, existing TELEGRAM_CHAT_ID)' },
  // "Friday group" = the people who play on Friday. Their poll is sent on Wednesday (asking
  // about the upcoming Friday) using the new TELEGRAM_CHAT_ID_WEDNESDAY.
  friday: { chatIdEnvVar: 'TELEGRAM_CHAT_ID_WEDNESDAY', label: 'Friday group (Wednesday poll, new TELEGRAM_CHAT_ID_WEDNESDAY)' },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await requireSuperAdmin(req, res);
  if (!session) return;

  const { group } = req.body ?? {};
  if (group !== 'wednesday' && group !== 'friday') {
    return res.status(400).json({ message: 'group must be "wednesday" or "friday"' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const config = GROUP_CONFIG[group as Group];
  const chatId = process.env[config.chatIdEnvVar];

  if (!botToken) {
    return res.status(500).json({ message: 'TELEGRAM_BOT_TOKEN is not set' });
  }
  if (!chatId) {
    return res.status(500).json({ message: `${config.chatIdEnvVar} is not set` });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `BRS Telegram config test - ${config.label}, sent at ${new Date().toISOString()}.`,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return res.status(502).json({ message: body.description ?? response.statusText });
    }

    res.status(200).json({ message: `Test message sent to ${config.label}` });
  } catch (error) {
    console.error('Telegram Test API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to send test message' });
  }
}
