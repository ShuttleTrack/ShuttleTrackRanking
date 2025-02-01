import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: {
    inline_keyboard: Array<Array<{
      text: string;
      url?: string;
      callback_data?: string;
    }>>;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
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
    
    const telegramMessage: TelegramMessage = {
      chat_id: process.env.TELEGRAM_CHAT_ID!,
      text: formattedMessage,
      parse_mode: 'HTML',
      reply_markup: buttons
    };

    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(telegramMessage),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }

    res.status(200).json({ message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Notification Error:', error);
    res.status(500).json({ message: 'Failed to send notification' });
  }
}
