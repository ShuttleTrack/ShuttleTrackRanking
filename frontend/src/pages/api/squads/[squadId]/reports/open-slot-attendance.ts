import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { getOpenSlotAttendance, type OpenSlotAttendanceReport } from '@/lib/reports/openSlotAttendance';

// Open-slot players who played in the last two months, grouped by day (squad-admin-only).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OpenSlotAttendanceReport | { message: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) return;

  try {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(await getOpenSlotAttendance(squadId));
  } catch (error) {
    console.error('Open-slot attendance API Error:', error);
    res.status(500).json({ message: 'Failed to fetch open-slot attendance' });
  }
}
