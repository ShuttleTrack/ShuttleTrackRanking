import type { NextApiRequest, NextApiResponse } from 'next';
import { processEncountersForDate } from '@/lib/ranking/processEncounters';

function parseDateParam(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Local port of POST /v2/encounters/{date}/process. Java returns the raw string "Done" (200) on
// success, or 500 with "No unprocessed encounters" if there's nothing to do that date - matched
// here with the same plain-text response and a thrown error for the empty case.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const date = parseDateParam(req.query.date);
  if (!date) {
    return res.status(400).json({ message: `Invalid date: ${req.query.date}` });
  }

  try {
    await processEncountersForDate(date);
    res.status(200).send('Done');
  } catch (error) {
    console.error('Local Process Encounters API Error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to process encounters' });
  }
}
