import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getMatchCombinations } from '@/utils/match';
import { requireSquadMember } from '@/lib/auth';
import { parseSquadId } from '@/lib/api/squadParam';

interface PlayerMatch {
  gameId: string;
  groupName: string;
  matchIndex: number;
  team1: string[];
  team2: string[];
  team1Score: number;
  team2Score: number;
  isPlayerInTeam1: boolean;
  createdAt: Date;
}

interface GameWithMatches {
  id: string;
  createdAt: Date;
  matches: PlayerMatch[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  try {
    // Resolved per request, per squad - a session carries no static playerId now, since the
    // same email can have a different Player row (or none) in every squad. The member gate
    // admits an admin with no Player row; this route acts as a player, so it requires one.
    const member = await requireSquadMember(req, res, squadId);
    if (!member) return;
    const { player } = member;
    if (!player) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const playerId = player.id;

    // Get all in-progress games
    const games = await prisma.game.findMany({
      where: {
        squadId,
        status: 'IN_PROGRESS'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const gamesWithPlayerMatches: GameWithMatches[] = [];

    // For each game, find matches where the player is involved
    for (const game of games) {
      const groups = game.groups as Record<string, number[]>;
      const scores = game.scores as Record<string, Record<string, { team1Score: number; team2Score: number }>>;
      const playerMatches: PlayerMatch[] = [];

      // Check each group
      for (const [groupName, playerIds] of Object.entries(groups)) {
        // Skip if player is not in this group
        if (!playerIds.includes(playerId)) continue;

        // Get all match combinations for this group
        const combinations = getMatchCombinations(playerIds.map(id => id.toString()));

        // Find matches where the player is involved
        combinations.forEach((match, index) => {
          const isInTeam1 = match.team1.includes(playerId.toString());
          const isInTeam2 = match.team2.includes(playerId.toString());

          if (isInTeam1 || isInTeam2) {
            const matchScores = scores[groupName]?.[index] || { team1Score: 0, team2Score: 0 };

            playerMatches.push({
              gameId: game.id,
              groupName,
              matchIndex: index,
              team1: match.team1,
              team2: match.team2,
              team1Score: matchScores.team1Score,
              team2Score: matchScores.team2Score,
              isPlayerInTeam1: isInTeam1,
              createdAt: game.createdAt
            });
          }
        });
      }

      // Only add games where the player has matches
      if (playerMatches.length > 0) {
        gamesWithPlayerMatches.push({
          id: game.id,
          createdAt: game.createdAt,
          matches: playerMatches
        });
      }
    }

    res.status(200).json(gamesWithPlayerMatches);
  } catch (error) {
    console.error('My Matches API Error:', error);
    res.status(500).json({ message: 'Failed to fetch matches' });
  }
}
