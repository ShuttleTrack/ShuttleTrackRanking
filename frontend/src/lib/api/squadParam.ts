import type { NextApiRequest, NextApiResponse } from 'next';

// Every route under pages/api/squads/[squadId]/** needs the same "parse and validate the
// squadId path segment" step before it can scope any query - shared here rather than repeated
// per route.
export function parseSquadId(req: NextApiRequest, res: NextApiResponse): number | null {
  const raw = req.query.squadId;
  const squadId = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(squadId)) {
    res.status(400).json({ message: 'Invalid squad id' });
    return null;
  }
  return squadId;
}
