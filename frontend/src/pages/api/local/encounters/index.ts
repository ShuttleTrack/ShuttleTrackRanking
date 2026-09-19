import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllEncounters } from '@/lib/ranking/encounters';

// Local port of GET /encounters (raw Encounter rows, all of them - no filtering, matching the
// original's `encounterRepository.findAll()`).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const encounters = await getAllEncounters();
    res.status(200).json(encounters);
  } catch (error) {
    console.error('Local Encounters API Error:', error);
    res.status(500).json({ message: 'Failed to fetch encounters' });
  }
}
