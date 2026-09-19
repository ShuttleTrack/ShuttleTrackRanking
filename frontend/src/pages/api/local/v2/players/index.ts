import type { NextApiRequest, NextApiResponse } from 'next';
import { addPlayer } from '@/lib/ranking/players';

// Local port of POST /v2/players. Parallel to the existing BE-proxying pages/api/players/index.ts
// POST branch - not wired into any UI yet. See MIGRATION_PLAN.md Phase 4.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email, initialScore } = req.body ?? {};
  if (!name || initialScore === undefined || initialScore === null) {
    return res.status(400).json({ message: 'name and initialScore are required' });
  }

  try {
    const player = await addPlayer({ name, email: email ?? null, initialScore: Number(initialScore) });
    res.status(200).json(player);
  } catch (error) {
    console.error('Local Add Player API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to add player' });
  }
}
