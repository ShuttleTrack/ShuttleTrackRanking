import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { requireSuperAdmin } from '@/lib/auth';
import { getSquadsForEmail } from '@/lib/auth/squadAccess';
import prisma from '@/lib/prisma';

// GET: squads the signed-in email administers or plays in (all of them, for a superadmin) -
// backs the squad-picker landing page. POST: create a squad - platform-superadmin only.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const squads = session.user.isSuperAdmin
        ? await prisma.squad.findMany({ orderBy: { name: 'asc' } })
        : await getSquadsForEmail(session.user.email);
      res.status(200).json(squads);
    } catch (error) {
      console.error('List Squads API Error:', error);
      res.status(500).json({ message: 'Failed to fetch squads' });
    }
  } else if (req.method === 'POST') {
    const session = await requireSuperAdmin(req, res);
    if (!session) return;

    const { name, slug } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ message: 'Name and slug are required' });
    }

    try {
      const squad = await prisma.squad.create({ data: { name, slug } });
      res.status(201).json(squad);
    } catch (error) {
      console.error('Create Squad API Error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to create squad'
      });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
