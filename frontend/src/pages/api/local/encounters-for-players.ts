import type { NextApiRequest, NextApiResponse } from 'next';
import { getCrossPlayerEncounterHistory } from '@/lib/ranking/encounters';

function parseOptionalId(value: unknown): number | null {
  if (typeof value !== 'string' || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

// Local port of GET /encounters-for-players?teamAp1&teamAp2&teamBp1&teamBp2. teamAp1 is
// required (Spring's @RequestParam(required = true) 400s when it's missing entirely).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (req.query.teamAp1 === undefined) {
    return res.status(400).json({ message: 'teamAp1 is required' });
  }
  const teamAp1 = Number(req.query.teamAp1);
  if (!Number.isInteger(teamAp1)) {
    return res.status(400).json({ message: `Invalid teamAp1: ${req.query.teamAp1}` });
  }

  const teamAp2 = parseOptionalId(req.query.teamAp2);
  const teamBp1 = parseOptionalId(req.query.teamBp1);
  const teamBp2 = parseOptionalId(req.query.teamBp2);

  try {
    const history = await getCrossPlayerEncounterHistory(teamAp1, teamAp2, teamBp1, teamBp2);
    res.status(200).json(history);
  } catch (error) {
    console.error('Local Encounters For Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch encounter history' });
  }
}
