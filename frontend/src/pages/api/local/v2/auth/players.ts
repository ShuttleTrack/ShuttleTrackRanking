import type { NextApiRequest, NextApiResponse } from 'next';
import { getSecurePlayers } from '@/lib/ranking/players';

// Local port of GET /v2/auth/players (secure variant incl. email). Phase 2 deferred this route
// since it needed Phase 5's auth decision settled first; the underlying `getSecurePlayers` was
// already built then. No auth gating here - matches every other pages/api/local/** route, which
// ports the read/write logic without enforcing session auth itself (that's the caller's job once
// actually wired in - see MIGRATION_PLAN.md Phase 7).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  try {
    const players = await getSecurePlayers(status);
    res.status(200).json(players);
  } catch (error) {
    console.error('Local Auth Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch players' });
  }
}
