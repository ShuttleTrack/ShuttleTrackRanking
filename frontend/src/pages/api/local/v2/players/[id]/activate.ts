import type { NextApiRequest, NextApiResponse } from 'next';
import { activatePlayer } from '@/lib/ranking/scorePersister';

// Local port of POST /v2/players/{playerId}/activate. Java returns void (200, empty body).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const playerId = Number(req.query.id);
  if (!Number.isInteger(playerId)) {
    return res.status(400).json({ message: `Invalid playerId: ${req.query.id}` });
  }

  const score = req.body?.score;
  const explicitScore = score === undefined || score === null ? null : Number(score);

  try {
    await activatePlayer(playerId, explicitScore);
    res.status(200).end();
  } catch (error) {
    console.error('Local Activate Player API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to activate player' });
  }
}
