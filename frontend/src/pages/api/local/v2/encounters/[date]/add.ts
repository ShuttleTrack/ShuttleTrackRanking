import type { NextApiRequest, NextApiResponse } from 'next';
import { addEncounter } from '@/lib/ranking/processEncounters';

function parseDateParam(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Local port of POST /v2/encounters/{date}/add. Java returns the raw string "ok" (200), not
// JSON - matched here with a plain-text response.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const date = parseDateParam(req.query.date);
  if (!date) {
    return res.status(400).json({ message: `Invalid date: ${req.query.date}` });
  }

  const { team1, team2, groupIndex, totalGroups } = req.body ?? {};
  if (!team1 || !team2) {
    return res.status(400).json({ message: 'team1 and team2 are required' });
  }

  try {
    await addEncounter(date, {
      team1: { player1: team1.player1, player2: team1.player2, setPoints: team1.setPoints },
      team2: { player1: team2.player1, player2: team2.player2, setPoints: team2.setPoints },
      groupIndex: groupIndex ?? null,
      totalGroups: totalGroups ?? null,
    });
    res.status(200).send('ok');
  } catch (error) {
    console.error('Local Add Encounter API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to add encounter' });
  }
}
