import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireSquadAdmin } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';
import { findScorelessPlayersInGroups } from '@/lib/ranking/players';
import { isValidationError } from '@/lib/api/validationError';

// A second create for the same game day must be a 400 naming the existing game, not a
// unique-index 500 (ATTENDANCE_VOTE_PLAN.md, "Game - one nullable link"). Replacing a draft is the
// edit path (PUT /games/[id]), which never touches the link.
async function gameDayLinkError(squadId: number, gameDayId: unknown): Promise<{ message: string; existingGameId?: string } | null> {
  if (gameDayId === undefined || gameDayId === null) return null;
  if (!Number.isInteger(gameDayId)) return { message: 'gameDayId must be an integer' };
  const gameDay = await prisma.gameDay.findUnique({
    where: { id: gameDayId as number },
    include: { game: { select: { id: true } } },
  });
  if (!gameDay || gameDay.squadId !== squadId) return { message: 'Game day not found' };
  if (gameDay.status !== 'VOTING_CLOSED') return { message: 'A game can only be planned from a game day whose voting has closed' };
  if (gameDay.game) {
    return {
      message: `This game day already has a game (${gameDay.game.id}) - open or delete it instead`,
      existingGameId: gameDay.game.id,
    };
  }
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  if (!(await requireSquadAdmin(req, res, squadId))) {
    return;
  }

  if (req.method === 'POST') {
    try {
      const { groups, gameDayId } = req.body;
      // OPEN_SLOT_PLAYERS_PLAN.md "Null-rankScore safety" item 2: a scoreless player must never
      // reach the Elo calculation - this is the authoritative gate, not the planner's client-side
      // bulk-assign panel.
      const scoreless = await findScorelessPlayersInGroups(squadId, groups ?? {});
      if (scoreless.length > 0) {
        return res.status(400).json({
          message: `These players need a rank score before a game day can be created: ${scoreless.map((p) => p.name).join(', ')}`,
          scorelessPlayers: scoreless,
        });
      }
      const linkError = await gameDayLinkError(squadId, gameDayId);
      if (linkError) {
        return res.status(400).json(linkError);
      }
      const game = await prisma.game.create({
        data: {
          squadId,
          groups,
          scores: {},
          status: 'DRAFT',
          // Traces the throwaway session state back to the attendance that produced it.
          gameDayId: gameDayId ?? null,
        }
      });
      res.status(201).json(game);
    } catch (error) {
      // Two creates racing past the check above.
      if ((error as { code?: string })?.code === 'P2002') {
        return res.status(400).json({ message: 'This game day already has a game - open or delete it instead' });
      }
      // A player id that is not in this squad is a bad request, not a server fault.
      if (isValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }
      console.error('Create Game API Error:', error);
      res.status(500).json({ message: 'Failed to create game' });
    }
  } else if (req.method === 'GET') {
    try {
      const games = await prisma.game.findMany({
        where: { squadId },
        orderBy: {
          createdAt: 'desc'
        }
      });
      res.status(200).json(games);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch games' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
