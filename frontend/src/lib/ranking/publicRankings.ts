import prisma from '@/lib/prisma';
import { getAllEncounters } from '@/lib/ranking/encounters';
import { getSecurePlayers } from '@/lib/ranking/players';
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

export function buildPublicRankingsFromMemberships(
  memberships: PublicMembershipInput[],
  encounters: RawEncounter[]
): PublicPlayerRankingData[] {
  const byEmail = new Map<string, PublicMembershipInput[]>();
  for (const row of memberships) {
    const key = normalizeEmail(row.email);
    const list = byEmail.get(key) ?? [];
    list.push(row);
    byEmail.set(key, list);
  }

  const merged: PublicPlayerRankingData[] = [];

  for (const rows of byEmail.values()) {
    const sortedForPrimary = [...rows].sort(comparePrimaryMembership);
    const primary = sortedForPrimary[0];
    const playerIds = rows.map((r) => r.playerId);
    const rankScore = rows.reduce((sum, r) => sum + r.rankScore, 0);
    const form = computeCombinedFormStats(playerIds, encounters);

    const squadMap = new Map<string, { slug: string; name: string }>();
    for (const r of rows) {
      squadMap.set(r.squadSlug, { slug: r.squadSlug, name: r.squadName });
    }
    const squads = [...squadMap.values()].sort((a, b) => a.name.localeCompare(b.name));

    merged.push({
      id: primary.playerId,
      name: primary.name,
      playerRank: 0,
      rankScore,
      squadSlug: primary.squadSlug,
      squadName: primary.squadName,
      squads,
      lastFive: form.lastFive,
      winRate: form.winRate,
    });
  }

  merged.sort((a, b) => b.rankScore - a.rankScore);
  merged.forEach((row, index) => {
    row.playerRank = index + 1;
  });

  return merged;
}

export async function getPublicRankings(): Promise<PublicRankingsResponse> {
  const squads = await prisma.squad.findMany({
    where: { enabled: true, isPublic: true },
    orderBy: { name: 'asc' },
  });

  const memberships: PublicMembershipInput[] = [];
  const encounters: RawEncounter[] = [];

  for (const squad of squads) {
    const [players, squadEncounters] = await Promise.all([
      getSecurePlayers(squad.id),
      getAllEncounters(squad.id),
    ]);
    encounters.push(...squadEncounters);

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

  const players = buildPublicRankingsFromMemberships(memberships, encounters);
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
  };
}
