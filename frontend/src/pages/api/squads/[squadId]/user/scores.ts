import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { isValidMatchScore } from '@/utils/scoreValidation';
import { requireSquadMember } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  // Resolved per request, per squad - see games/my-matches.ts for why. Acts as a player, so an
  // admin the member gate admits without a Player row is still refused.
  const member = await requireSquadMember(req, res, squadId);
  if (!member) return;
  const { player } = member;
  if (!player) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { gameId, groupName, matchIndex, team1Score, team2Score } = req.body;

  try {
    // Get the game
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!game || game.squadId !== squadId) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (game.status !== 'IN_PROGRESS') {
      return res.status(400).json({ message: 'Game is not in progress' });
    }

    // Check if user is part of this match
    const groups = game.groups as Record<string, number[]>;
    const groupPlayers = groups[groupName];

    if (!groupPlayers?.includes(player.id)) {
      return res.status(403).json({ message: 'Not authorized to update this match' });
    }

    // Update the score
    const scores = game.scores as Record<string, Record<string, { team1Score: number; team2Score: number }>>;

    // Check if score already exists and is not 0-0
    if (scores[groupName]?.[matchIndex] && (scores[groupName][matchIndex].team1Score !== 0 || scores[groupName][matchIndex].team2Score !== 0)) {
      return res.status(400).json({ message: 'Score already submitted' });
    }

    if (!isValidMatchScore(team1Score, team2Score)) {
      return res.status(400).json({ message: 'Invalid score' });
    }

    await prisma.game.update({
      where: { id: gameId },
      data: {
        scores: {
          ...scores,
          [groupName]: {
            ...(scores[groupName] || {}),
            [matchIndex]: { team1Score, team2Score }
          }
        }
      }
    });

    res.status(200).json({ message: 'Score submitted successfully' });
  } catch (error) {
    console.error('Submit Score API Error:', error);
    res.status(500).json({ message: 'Failed to submit score' });
  }
}
