import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { parseSquadId } from '@/lib/api/squadParam';

// Public - no login required (SQUAD_TENANCY_PLAN.md: game viewer stays a public board).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const { id } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Flush headers
  res.flushHeaders();

  try {
    // Send initial data
    const game = await prisma.game.findUnique({ where: { id: id as string } });
    if (!game || game.squadId !== squadId) {
      res.status(404).end();
      return;
    }

    // Send initial data with event type
    res.write(`event: message\ndata: ${JSON.stringify(game)}\n\n`);

    // Set up database polling
    const interval = setInterval(async () => {
      try {
        const updatedGame = await prisma.game.findUnique({ where: { id: id as string } });
        if (updatedGame) {
          res.write(`event: message\ndata: ${JSON.stringify(updatedGame)}\n\n`);
        }
      } catch (error) {
        console.error('SSE Error:', error);
        clearInterval(interval);
        res.end();
      }
    }, 1000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  } catch (error) {
    console.error('Initial Game Fetch Error:', error);
    res.status(500).end();
  }
}
