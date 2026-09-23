import type { NextApiRequest, NextApiResponse } from 'next';
import { JoinRequestStatus } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { isValidationError } from '@/lib/api/validationError';
import { createJoinRequest, listJoinRequestsForSquad } from '@/lib/joinRequests';

// POST: any signed-in person asks to join this squad. GET: that squad's admins read the queue.
// (SELF_REGISTRATION_PLAN.md)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Only name and message are read from the body. The requester's identity comes from the
    // session and nothing else - any `email` sent by the caller is ignored outright, because
    // sign-in is now open to every verified Google account and trusting a body field here would
    // let anyone file a request in someone else's name.
    const { name, message } = req.body ?? {};

    try {
      const request = await createJoinRequest(squadId, session.user.email, { name, message });
      res.status(201).json(request);
    } catch (error) {
      if (isValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }
      console.error('Create Join Request API Error:', error);
      res.status(500).json({ message: 'Failed to create join request' });
    }
  } else if (req.method === 'GET') {
    const session = await requireSquadAdmin(req, res, squadId);
    if (!session) return;

    const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const status =
      rawStatus && rawStatus in JoinRequestStatus
        ? (rawStatus as JoinRequestStatus)
        : undefined;

    try {
      const requests = await listJoinRequestsForSquad(squadId, status);
      res.status(200).json(requests);
    } catch (error) {
      console.error('List Join Requests API Error:', error);
      res.status(500).json({ message: 'Failed to fetch join requests' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
