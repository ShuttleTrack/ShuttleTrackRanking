import prisma from '@/lib/prisma';
import { getAllEncounters } from '@/lib/ranking/encounters';
import { getSecurePlayers } from '@/lib/ranking/players';
import { filterBoardVisible } from '@/lib/ranking/boardVisibility';
import type { PublicPlayerRankingData, PublicRankingsResponse } from '@/types/rankings';
import { computeCombinedFormStats, type RawEncounter } from '@/utils/playerForm';

export interface PublicMembershipInput {
  email: string;
  playerId: number;
  name: string;
  rankScore: number;
  playerRank: number;
  squadId: number;
  squadSlug: string;
  squadName: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function comparePrimaryMembership(a: PublicMembershipInput, b: PublicMembershipInput): number {
  if (b.rankScore !== a.rankScore) {
    return b.rankScore - a.rankScore;
  }
  if (a.playerRank !== b.playerRank) {
    return a.playerRank - b.playerRank;
  }
  return a.squadId - b.squadId;
}

// One row per person who is board-visible and ranked in at least one public squad AND has a
// stored public rating (lib/ranking/publicRatingRecalc.ts) - someone who has never played a
// public match has no rating yet, so no row. Squad memberships only decide who is shown and
// which name/squad chips they get; the score is the stored public rating, never a squad score.
export function buildPublicRankingsFromMemberships(
  memberships: PublicMembershipInput[],
  encounters: RawEncounter[],
  ratingByEmail: Map<string, number>
): PublicPlayerRankingData[] {
  const byEmail = new Map<string, PublicMembershipInput[]>();
  for (const row of memberships) {
    const key = normalizeEmail(row.email);
    const list = byEmail.get(key) ?? [];
    list.push(row);
    byEmail.set(key, list);
  }

  const merged: PublicPlayerRankingData[] = [];

  byEmail.forEach((rows, email) => {
    const rating = ratingByEmail.get(email);
    if (rating === undefined) return;

    const primary = [...rows].sort(comparePrimaryMembership)[0];
    const form = computeCombinedFormStats(
      rows.map((r) => r.playerId),
      encounters
    );

    const squadMap = new Map<string, { slug: string; name: string }>();
    for (const r of rows) {
      squadMap.set(r.squadSlug, { slug: r.squadSlug, name: r.squadName });
    }
    const squads = Array.from(squadMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    merged.push({
      id: primary.playerId,
      name: primary.name,
      playerRank: 0,
      rankScore: Math.round(rating),
      squadSlug: primary.squadSlug,
      squadName: primary.squadName,
      squads,
      lastFive: form.lastFive,
      winRate: form.winRate,
    });
  });

  merged.sort((a, b) => b.rankScore - a.rankScore);
  merged.forEach((row, index) => {
    row.playerRank = index + 1;
  });

  return merged;
}

export async function getPublicRankings(): Promise<PublicRankingsResponse> {
  const [squads, storedRatings] = await Promise.all([
    prisma.squad.findMany({
      where: { enabled: true, isPublic: true },
      orderBy: { name: 'asc' },
    }),
    prisma.publicRating.findMany({ select: { email: true, rating: true } }),
  ]);

  const memberships: PublicMembershipInput[] = [];
  const encounters: RawEncounter[] = [];

  for (const squad of squads) {
    const [allPlayers, squadEncounters] = await Promise.all([
      getSecurePlayers(squad.id),
      getAllEncounters(squad.id),
    ]);
    encounters.push(...squadEncounters);
    // OPEN_SLOT_PLAYERS_PLAN.md: same board-visibility rule as the squad-level leaderboard,
    // applied here too since this aggregate has the identical open-slot clutter concern.
    const players = await filterBoardVisible(squad.id, allPlayers);

    for (const player of players) {
      if (player.playerRank === null || player.playerRank <= 0 || player.rankScore === null) {
        continue;
      }
      memberships.push({
        email: player.email,
        playerId: player.id,
        name: player.name,
        rankScore: player.rankScore,
        playerRank: player.playerRank,
        squadId: squad.id,
        squadSlug: squad.slug,
        squadName: squad.name,
      });
    }
  }

  const ratingByEmail = new Map(storedRatings.map((r) => [r.email, r.rating]));
  const players = buildPublicRankingsFromMemberships(memberships, encounters, ratingByEmail);
  const totalPlayers = players.length;
  const topScore = totalPlayers > 0 ? Math.max(...players.map((p) => p.rankScore)) : 0;
  const averageScore =
    totalPlayers > 0 ? players.reduce((acc, p) => acc + p.rankScore, 0) / totalPlayers : 0;

  return {
    stats: {
      totalPlayers,
      topScore,
      averageScore,
    },
    players,
    ratingsCalculated: storedRatings.length > 0,
  };
}
