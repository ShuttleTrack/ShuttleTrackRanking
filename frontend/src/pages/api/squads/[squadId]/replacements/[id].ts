import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { cancelSlotReplacement, shortenSlotReplacement } from '@/lib/replacements';
import { parseSquadId } from '@/lib/api/squadParam';

// PATCH ends a replacement early - either outright (no body, or `{ cancel: true }`) or by pulling
// its end date in (`{ endDate }`). Only the nominating fulltime player can do either
// (self-service mirrors self-service creation; no admin override in this first cut).
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

  const { id } = req.query;
  const replacementId = Number(id);
  if (!Number.isInteger(replacementId)) {
    return res.status(400).json({ message: 'Invalid replacement id' });
  }

  const newEndDate = req.body?.endDate;
  if (newEndDate !== undefined && typeof newEndDate !== 'string') {
    return res.status(400).json({ message: 'endDate must be a YYYY-MM-DD string' });
  }

  try {
    const replacement = newEndDate
      ? await shortenSlotReplacement(squadId, replacementId, session.user.email, newEndDate)
      : await cancelSlotReplacement(squadId, replacementId, session.user.email);
    res.status(200).json(replacement);
  } catch (error) {
    console.error('Cancel Replacement API Error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to cancel replacement',
    });
  }
}
