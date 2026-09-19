import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlayers } from '@/lib/ranking/players';

// Local (Prisma-backed) port of GET /players. Parallel to pages/api/players/index.ts, which
// still proxies to the Java backend - not wired into any UI yet. See MIGRATION_PLAN.md Phase 2.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  try {
    const players = await getPlayers(status);
    res.status(200).json(players);
  } catch (error) {
    console.error('Local Players API Error:', error);
    res.status(500).json({ message: 'Failed to fetch players' });
  }
}
