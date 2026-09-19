import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlayerEncounterHistory } from '@/lib/ranking/encounters';

// Local port of GET /players/{playerId}/encounters - 404 when the player doesn't exist,
// matching EncounterController.getPlayerEncounterHistory's ResponseEntity.notFound() branch.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const playerId = Number(req.query.id);
  if (!Number.isInteger(playerId)) {
    return res.status(400).json({ message: `Invalid playerId: ${req.query.id}` });
  }

  try {
    const result = await getPlayerEncounterHistory(playerId);
    if (result === null) {
      return res.status(404).end();
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Local Player Encounters API Error:', error);
    res.status(500).json({ message: 'Failed to fetch player encounters' });
  }
}
