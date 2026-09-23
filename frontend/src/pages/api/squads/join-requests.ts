import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { listJoinRequestsForEmail } from '@/lib/joinRequests';

// The caller's own join requests, across every squad and every status
// (SELF_REGISTRATION_PLAN.md).
//
// Deliberately separate from GET /api/squads/open rather than folded into it: that endpoint
// filters to enabled && openForOpenSlot squads, so a squad closing or being disabled while a
// request is pending would take that request off every surface the requester can reach - they
// could neither see it nor withdraw it. This one is scoped by email only.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const requests = await listJoinRequestsForEmail(session.user.email);
    res.status(200).json(requests);
  } catch (error) {
    console.error('My Join Requests API Error:', error);
    res.status(500).json({ message: 'Failed to fetch your join requests' });
  }
}
