import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '@/lib/auth';
import { sendTelegramMessage } from '@/lib/telegram/sendMessage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireSuperAdmin(req, res);
  if (!session) return;

  const { title, message, buttons } = req.body;

  if (!title || !message) {
    return res.status(400).json({ message: 'Title and message are required' });
  }

  try {
    const formattedMessage = `<b>${title}</b>\n\n${message}`;
    
    // Validate URL in buttons if present
    if (buttons?.inline_keyboard) {
      buttons.inline_keyboard.forEach((row: any) => {
        row.forEach((button: any) => {
          if (button.url && !button.url.startsWith('http')) {
            throw new Error('Invalid URL in button: URLs must be absolute');
          }
        });
      });
    }
    
    const result = await sendTelegramMessage(
      process.env.TELEGRAM_BOT_TOKEN!,
      process.env.TELEGRAM_CHAT_ID!,
      formattedMessage,
      buttons
    );

    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description}`);
    }

    res.status(200).json({ message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Notification Error:', error);
    res.status(500).json({ message: 'Failed to send notification' });
  }
}
