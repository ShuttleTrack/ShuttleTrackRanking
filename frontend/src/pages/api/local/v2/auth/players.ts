import type { NextApiRequest, NextApiResponse } from 'next';
import { getSecurePlayers } from '@/lib/ranking/players';
import { requireAuth } from '@/lib/auth';

// Local port of GET /v2/auth/players (secure variant incl. email). Phase 2 deferred this route
// since it needed Phase 5's auth decision settled first; the underlying `getSecurePlayers` was
// already built then. Guarded with requireAuth - matches SecurityConfig.java's
// `GET /v2/auth/**` requiring authentication (unlike most GET routes, which are permitAll), and
// matches the existing pages/api/admin/players.ts proxy this replaces.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  try {
    const players = await getSecurePlayers(status);
    res.status(200).json(players);
  } catch (error) {
    console.error('Local Auth Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch players' });
  }
}
