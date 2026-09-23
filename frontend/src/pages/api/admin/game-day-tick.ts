import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '@/lib/auth';
import { runGameDayTick } from '@/lib/gameDay/scheduler';

// "Run scheduler tick now" (ATTENDANCE_VOTE_PLAN.md, end-to-end verification) - platform
// superadmin only, mirroring the Telegram test buttons on the admin dashboard, so a full vote
// cycle can be exercised without waiting for the 5-minute cron. Runs exactly the tick the cron
// runs, against the real clock.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await requireSuperAdmin(req, res);
  if (!session) return;

  try {
    res.status(200).json(await runGameDayTick());
  } catch (error) {
    console.error('Game Day Tick API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Tick failed' });
  }
}
