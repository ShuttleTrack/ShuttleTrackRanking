import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getMatchCombinations } from '@/utils/match';

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper function to get players for a match using IDs instead of names
function getMatchPlayersById(groupPlayers: number[], matchIndex: number): { team1: number[], team2: number[] } {
  if (groupPlayers.length === 4 || groupPlayers.length === 5) {
    // Get combinations using player IDs
    const combinations = getMatchCombinations(groupPlayers.map(id => id.toString()));
    const match = combinations[matchIndex];
    
    // Convert string IDs back to numbers
    return {
      team1: match.team1.map(id => parseInt(id)),
      team2: match.team2.map(id => parseInt(id))
    };
  }
  throw new Error('Invalid group size');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Get auth session
  const session = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ message: 'Invalid game ID' });
  }

  try {
    // Get game from database
    const game = await prisma.game.findUnique({
      where: { id }
    });

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Submit each match result to external API
    const scores = game.scores as Record<string, Record<string, { team1Score: number; team2Score: number; submitted?: boolean }>>;
    const groups = game.groups as Record<string, number[]>;
    let updatedScores = { ...scores };
    let hasErrors = false;
    const errors: Array<{ group: string; match: string; error: string }> = [];

    const groupNames = Object.keys(groups);
    const totalGroups = groupNames.length;

    for (const [groupName, groupScores] of Object.entries(scores)) {
      updatedScores[groupName] = { ...groupScores };
      const groupPlayers = groups[groupName];
      const groupIndex = groupNames.indexOf(groupName) + 1;
      
      for (const [matchIndex, score] of Object.entries(groupScores)) {
        if (score.team1Score === 0 && score.team2Score === 0) continue;
        if (score.submitted) continue;

        try {
          const gameDate = formatDate(game.createdAt);
          const { team1, team2 } = getMatchPlayersById(groupPlayers, parseInt(matchIndex));
          
          console.log(`Submitting match for Game ${id}:`, {
            group: groupName,
            match: parseInt(matchIndex) + 1,
            team1: {
              players: team1,
              score: score.team1Score
            },
            team2: {
              players: team2,
              score: score.team2Score
            },
            date: gameDate
          });

          const response = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/v2/encounters/${gameDate}/add`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.accessToken}`,
              },
              body: JSON.stringify({
                team1: {
                  player1: team1[0],
                  player2: team1[1],
                  setPoints: score.team1Score
                },
                team2: {
                  player1: team2[0],
                  player2: team2[1],
                  setPoints: score.team2Score
                },
                groupIndex,
                totalGroups
              })
            }
          );

          if (response.ok) {
            console.log(`✓ Successfully submitted match ${parseInt(matchIndex) + 1} for ${groupName}`);
            // Mark individual score as submitted on success
            updatedScores[groupName][matchIndex] = {
              ...score,
              submitted: true
            };

            // Save progress after each successful submission
            await prisma.game.update({
              where: { id },
              data: { scores: updatedScores }
            });
          } else {
            console.error(`✗ Failed to submit match ${parseInt(matchIndex) + 1} for ${groupName}:`, response.statusText);
            hasErrors = true;
            errors.push({
              group: groupName,
              match: matchIndex,
              error: `Failed with status: ${response.status}`
            });
          }
        } catch (error) {
          console.error(`✗ Error submitting match ${parseInt(matchIndex) + 1} for ${groupName}:`, error);
          hasErrors = true;
          errors.push({
            group: groupName,
            match: matchIndex,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    // Update final game status
    const finalGame = await prisma.game.update({
      where: { id },
      data: {
        scores: updatedScores,
        status: hasErrors ? 'IN_PROGRESS' : 'COMPLETED'
      }
    });

    // Return appropriate response
    if (hasErrors) {
      res.status(207).json({
        game: finalGame,
        errors,
        message: 'Some matches failed to submit'
      });
    } else {
      res.status(200).json(finalGame);
    }
  } catch (error) {
    console.error('Submit Game API Error:', error);
    res.status(500).json({ message: 'Failed to submit game' });
  }
} 