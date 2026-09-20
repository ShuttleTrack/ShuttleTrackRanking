import type { NextApiRequest, NextApiResponse } from 'next';
import { groupBy, sumBy } from '@/utils/string';
import { getPlayerEncounterHistory, type PlayerEncounterHistoryRecord } from '@/lib/ranking/encounters';
import { parseSquadId } from '@/lib/api/squadParam';

interface EncountersStats {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface EnhancedEncountersResponse {
  stats: EncountersStats;
  encountersByDate: Record<string, PlayerEncounterHistoryRecord[]>;
  scoreSumByDate: Record<string, number>;
}

// Public - no login required (SQUAD_TENANCY_PLAN.md: player ranking history stays a public board).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EnhancedEncountersResponse | { message: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const squadId = parseSquadId(req, res);
  if (squadId === null) return;

  const playerId = Number(req.query.id);

  try {
    const data = await getPlayerEncounterHistory(squadId, playerId);
    // Matches the pre-cutover behavior exactly: the old proxy never distinguished a 404 from
    // any other failure (`if (!response.ok) throw ...`), always resulting in a 500. Preserved
    // rather than "fixed" here - Phase 7 cutover keeps current observable behavior as-is.
    if (!data) {
      throw new Error('Failed to fetch encounters');
    }

    const encounters = data.encounterHistory;

    // Calculate stats
    const totalGames = encounters.length;
    const wins = encounters.filter((e) => e.playerTeamPoints > e.opponentTeamPoints).length;
    const losses = totalGames - wins;
    const winRate = totalGames > 0 ? (wins / totalGames * 100) : 0;

    // Group encounters by date
    const encountersByDate = groupBy(
      encounters,
      (encounter: PlayerEncounterHistoryRecord) => encounter.encounterDate
    );

    // Calculate score sums by date
    const scoreSumByDate = sumBy(
      encounters,
      (encounter: PlayerEncounterHistoryRecord) => encounter.encounterDate
    );

    const enhancedResponse: EnhancedEncountersResponse = {
      stats: {
        totalGames,
        wins,
        losses,
        winRate
      },
      encountersByDate,
      scoreSumByDate
    };

    res.status(200).json(enhancedResponse);
  } catch (error) {
    console.error('Encounters API Error:', error);
    res.status(500).json({ message: 'Failed to fetch encounters' });
  }
}
