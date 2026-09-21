import type { NextApiRequest, NextApiResponse } from 'next';
import { getCrossPlayerEncounterHistory, type PlayerEncounterHistoryRecord } from '@/lib/ranking/encounters';
import { parseSquadId } from '@/lib/api/squadParam';

// Public - no login required (SQUAD_TENANCY_PLAN.md: encounter history stays a public board).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerEncounterHistoryRecord[] | { message: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const { teamA1, teamA2, teamB1, teamB2 } = req.query;

  try {
    const data = await getCrossPlayerEncounterHistory(
      squadId,
      Number(teamA1),
      Number(teamA2),
      Number(teamB1),
      Number(teamB2)
    );
    res.status(200).json(data);
  } catch (error) {
    console.error('Encounter History API Error:', error);
    res.status(500).json({ message: 'Failed to fetch encounter history' });
  }
}
