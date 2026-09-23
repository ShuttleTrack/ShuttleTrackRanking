import prisma from '@/lib/prisma';

export type GameGroups = Record<string, number[]>;
export type GameScores = Record<string, Record<string, { team1Score: number; team2Score: number }>>;

// Percentage of a game's round-robin matches that have a score entered. A group of n plays
// n(n-1)/4 matches (4 -> 3, 5 -> 5); a match counts as played once either side has points.
export function gameProgress(groups: GameGroups, scores: GameScores): number {
  let totalMatches = 0;
  let completedMatches = 0;

  for (const [groupName, players] of Object.entries(groups)) {
    const n = players.length;
    totalMatches += (n * (n - 1)) / 4;

    for (const score of Object.values(scores[groupName] || {})) {
      if (score.team1Score > 0 || score.team2Score > 0) {
        completedMatches++;
      }
    }
  }

  return totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;
}

export interface PublicLiveGame {
  id: string;
  progress: number;
  createdAt: Date;
  squad: { slug: string; name: string };
}

// In-progress games across every enabled + isPublic squad, for the site-root board. Only the
// progress summary leaves the server - the viewer page it links to is the squad's own
// link-public /s/[slug]/game-viewer, which already streams the full game.
export async function getPublicLiveGames(): Promise<PublicLiveGame[]> {
  const games = await prisma.game.findMany({
    where: {
      status: 'IN_PROGRESS',
      squad: { enabled: true, isPublic: true },
    },
    include: { squad: { select: { slug: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return games.map((game) => ({
    id: game.id,
    progress: gameProgress(game.groups as GameGroups, game.scores as GameScores),
    createdAt: game.createdAt,
    squad: { slug: game.squad.slug, name: game.squad.name },
  }));
}
