import type { NextApiRequest, NextApiResponse } from 'next';
import { PlayerType } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { isValidationError } from '@/lib/api/validationError';
import { approveJoinRequest, rejectJoinRequest, withdrawJoinRequest } from '@/lib/joinRequests';

// PATCH: a squad admin decides a pending request - approving creates the Player row (open-slot
// by default). DELETE: the requester withdraws their own. Closest existing template is
// replacements/[id]/cancellation.ts, down to the { decision } body shape, so the two admin
// decision surfaces read alike. (SELF_REGISTRATION_PLAN.md)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const rawId = req.query.id;
  const id = typeof rawId === 'string' ? Number(rawId) : NaN;
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid request id' });
  }

  if (req.method === 'PATCH') {
    const session = await requireSquadAdmin(req, res, squadId);
    if (!session) return;
    // requireSquadAdmin guarantees a session, but a platform superadmin reaches here too and the
    // type is still Session - guard the email rather than asserting it.
    if (!session.user?.email) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { decision, playerType, initialScore, name } = req.body ?? {};
    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
    }
    if (
      playerType !== undefined &&
      playerType !== PlayerType.FULLTIME &&
      playerType !== PlayerType.OPEN_SLOT
    ) {
      return res.status(400).json({ message: `Invalid playerType: ${playerType}` });
    }

    try {
      if (decision === 'reject') {
        const request = await rejectJoinRequest(squadId, id, session.user.email);
        return res.status(200).json(request);
      }

      const result = await approveJoinRequest(squadId, id, session.user.email, {
        playerType,
        initialScore:
          initialScore === undefined || initialScore === null || initialScore === ''
            ? null
            : Number(initialScore),
        name,
      });
      return res.status(200).json(result);
    } catch (error) {
      if (isValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }
      console.error('Decide Join Request API Error:', error);
      res.status(500).json({ message: 'Failed to decide join request' });
    }
  } else if (req.method === 'DELETE') {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      // Ownership is decided inside withdrawJoinRequest against this session email - there is no
      // body field involved, deliberately.
      const request = await withdrawJoinRequest(id, session.user.email);
      res.status(200).json(request);
    } catch (error) {
      if (isValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }
      console.error('Withdraw Join Request API Error:', error);
      res.status(500).json({ message: 'Failed to withdraw join request' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
