import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '@/lib/auth';
import { getPublicRatingStatus, recalculatePublicRatings } from '@/lib/ranking/publicRatingRecalc';

// Platform superadmin only - the public rating spans every public squad, so it lives on
// /platform/squads rather than any one squad's admin pages. GET: when the stored ratings were
// last rebuilt. POST: rebuild them now from every processed public-squad match (this is also the
// backfill on a fresh deploy).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSuperAdmin(req, res);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getPublicRatingStatus());
    }
    if (req.method === 'POST') {
      return res.status(200).json(await recalculatePublicRatings());
    }
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Public Ratings API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Public rating recalculation failed' });
  }
}
