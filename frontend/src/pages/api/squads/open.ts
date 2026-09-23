import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { listOpenSquads } from '@/lib/squadDirectory';

// The squad directory behind /squads/browse (SELF_REGISTRATION_PLAN.md): squads accepting join
// requests, each carrying this caller's standing with it so the page renders the right CTA from
// one fetch.
//
// Signed-in only - you need an identity to request anything, and the response embeds the
// caller's own membership/pending state. A static segment under api/squads/, which Next resolves
// ahead of [squadId], so it never reaches parseSquadId.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const squads = await listOpenSquads(session.user.email);
    res.status(200).json(squads);
  } catch (error) {
    console.error('Open Squads API Error:', error);
    res.status(500).json({ message: 'Failed to fetch open squads' });
  }
}
