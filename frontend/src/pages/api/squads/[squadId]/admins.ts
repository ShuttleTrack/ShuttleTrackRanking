import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import prisma from '@/lib/prisma';

// Add/remove SquadAdmin rows - platform-superadmin only (SQUAD_TENANCY_PLAN.md: squad creation
// and admin assignment is gated at the platform level, same as the reference model this was
// ported from).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const session = await requireSuperAdmin(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    try {
      const admins = await prisma.squadAdmin.findMany({ where: { squadId } });
      res.status(200).json(admins);
    } catch (error) {
      console.error('List Squad Admins API Error:', error);
      res.status(500).json({ message: 'Failed to fetch squad admins' });
    }
  } else if (req.method === 'POST') {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    try {
      const admin = await prisma.squadAdmin.create({
        data: { squadId, email: email.toLowerCase() }
      });
      res.status(201).json(admin);
    } catch (error) {
      console.error('Add Squad Admin API Error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to add squad admin'
      });
    }
  } else if (req.method === 'DELETE') {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    try {
      await prisma.squadAdmin.delete({
        where: { squadId_email: { squadId, email: email.toLowerCase() } }
      });
      res.status(200).json({ message: 'Squad admin removed successfully' });
    } catch (error) {
      console.error('Remove Squad Admin API Error:', error);
      res.status(500).json({ message: 'Failed to remove squad admin' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
