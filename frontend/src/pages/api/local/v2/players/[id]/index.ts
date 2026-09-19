import type { NextApiRequest, NextApiResponse } from 'next';
import { updatePlayer } from '@/lib/ranking/players';

// Local port of PUT /v2/players/{id}.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: `Invalid id: ${req.query.id}` });
  }

  const { name, email } = req.body ?? {};

  try {
    const player = await updatePlayer({ id, name, email });
    res.status(200).json(player);
  } catch (error) {
    console.error('Local Update Player API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update player' });
  }
}
