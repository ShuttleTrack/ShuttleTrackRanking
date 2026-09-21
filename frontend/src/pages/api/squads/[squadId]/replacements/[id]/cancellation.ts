import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { getSquadAccess } from '@/lib/auth/squadAccess';
import { approveCancellationRequest, rejectCancellationRequest } from '@/lib/replacements';
import { parseSquadId } from '@/lib/api/squadParam';

// PATCH decides a pending early-cancellation request (from PATCH .../replacements/[id]) - squad
// admin only. Body: `{ decision: 'approve' | 'reject' }`. Approve applies whatever the player
// requested (outright cancel, or the shortened end date); reject just clears the request and
// leaves the replacement on its original terms.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { isSquadAdmin } = await getSquadAccess(session.user.email, squadId);
  const isAdmin = isSquadAdmin || Boolean(session.user.isSuperAdmin);
  if (!isAdmin) {
    return res.status(403).json({ message: 'Only a squad admin can decide a cancellation request' });
  }

  const { id } = req.query;
  const replacementId = Number(id);
  if (!Number.isInteger(replacementId)) {
    return res.status(400).json({ message: 'Invalid replacement id' });
  }

  const { decision } = req.body ?? {};
  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
  }

  try {
    const replacement =
      decision === 'approve'
        ? await approveCancellationRequest(squadId, replacementId)
        : await rejectCancellationRequest(squadId, replacementId);
    res.status(200).json(replacement);
  } catch (error) {
    console.error('Decide Replacement Cancellation API Error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to decide cancellation request',
    });
  }
}
