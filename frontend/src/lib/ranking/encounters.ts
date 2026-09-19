import type { Encounter as PrismaEncounter, Player as PrismaPlayer } from '@prisma/client';
import prisma from '@/lib/prisma';

// Ported from backend EncounterController.java + EncounterService.java (MIGRATION_PLAN.md
// Phase 2). Field names match the real Java DTOs exactly - see §4/§5 of the plan.

const TEAM_SEPARATOR = ':';

export interface TeamScoreBreakdown {
  baseElo: number;
  tierAdjustment: number;
  consolation: number;
  finalScore: number;
}

interface ScoreBreakdown {
  team1: TeamScoreBreakdown;
  team2: TeamScoreBreakdown;
  groupIndex: number;
  totalGroups: number;
  tierFactor: number;
  scoreGapTriggered: boolean;
}

export interface PlayerRef {
  playerName: string;
  playerId: number;
}

export interface PlayerEncounterHistoryRecord {
  encounterDate: string;
  encounterId: number;
  encounterScore: number;
  opponentTeam: (PlayerRef | null)[];
  opponentTeamPoints: number;
  playerTeam: (PlayerRef | null)[];
  playerTeamPoints: number;
  scoreBreakdown: TeamScoreBreakdown | null;
  groupIndex: number | null;
  totalGroups: number | null;
}

export interface PlayerEncounterHistory {
  playerName: string;
  playerId: number;
  encounterHistory: PlayerEncounterHistoryRecord[];
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function teamIds(idsString: string): number[] {
  return idsString.split(TEAM_SEPARATOR).map(Number);
}

// EncounterService.getPlayerTeam: checks team1 membership only, defaults to team2 otherwise
// (so a playerId absent from both teams would - like the Java version - be silently treated
// as team2; preserved rather than "fixed"). Exported for direct unit testing.
export function playerSide(encounter: Pick<PrismaEncounter, 'team1'>, playerId: number): 1 | 2 {
  return teamIds(encounter.team1).includes(playerId) ? 1 : 2;
}

// EncounterService.getPlayerTeamBreakdown: swallows parse failures and returns null, same as
// the original's catch-and-log.
export function playerTeamBreakdown(encounter: PrismaEncounter, playerId: number): TeamScoreBreakdown | null {
  if (encounter.scoreBreakdown === null) return null;
  try {
    const breakdown = encounter.scoreBreakdown as unknown as ScoreBreakdown;
    return playerSide(encounter, playerId) === 1 ? breakdown.team1 : breakdown.team2;
  } catch {
    return null;
  }
}

// Raw `Encounter` entity shape as Jackson serializes it for GET /encounters - notably
// `scoreBreakdown` is a JSON-encoded *string* on the Java side (Encounter.scoreBreakdown :
// String), not a nested object, unlike the parsed TeamScoreBreakdown used elsewhere. Prisma's
// `Json` column type gives us a parsed value, so it's re-stringified here to match.
export interface RawEncounter {
  id: number;
  team1: string;
  team2: string;
  encounterDate: string;
  processed: boolean;
  team1SetPoints: number;
  team2SetPoints: number;
  calculatedScore: number | null;
  groupIndex: number | null;
  totalGroups: number | null;
  scoreBreakdown: string | null;
}

export function toRawEncounter(e: PrismaEncounter): RawEncounter {
  return {
    id: e.id,
    team1: e.team1,
    team2: e.team2,
    encounterDate: toDateOnlyString(e.encounterDate),
    processed: e.processed,
    team1SetPoints: e.team1SetPoints,
    team2SetPoints: e.team2SetPoints,
    calculatedScore: e.calculatedScore,
    groupIndex: e.groupIndex,
    totalGroups: e.totalGroups,
    scoreBreakdown: e.scoreBreakdown === null ? null : JSON.stringify(e.scoreBreakdown),
  };
}

// GET /encounters
export async function getAllEncounters(): Promise<RawEncounter[]> {
  const encounters = await prisma.encounter.findMany();
  return encounters.map(toRawEncounter);
}

// EncounterService.getPlayerInfo: returns null for an id with no matching Player row (e.g. a
// deleted player still referenced by an old encounter's team string) - the null is left in the
// team array as-is, not filtered out, matching the original.
function playerRef(player: PrismaPlayer | null, playerId: number): PlayerRef | null {
  return player ? { playerName: player.name, playerId } : null;
}

// EncounterService.getPlayerEncounterHistory(int playerId).
export async function getPlayerEncounterHistory(playerId: number): Promise<PlayerEncounterHistory | null> {
  const currentPlayer = await prisma.player.findUnique({ where: { id: playerId } });
  if (!currentPlayer) return null;

  const scoreHistoryRows = await prisma.scoreHistory.findMany({ where: { playerId } });
  const encounterIds = scoreHistoryRows.map((h) => h.encounterId);
  // findAllByIdIn against synthetic negative ids (absentee/-1, deactivate/-2, activate/-3)
  // simply matches nothing - same as the original.
  const encounters = await prisma.encounter.findMany({ where: { id: { in: encounterIds } } });

  // Comparator.comparing(encounterDate).thenComparing(id).reversed() -> both descending.
  encounters.sort((a, b) => {
    const dateDiff = b.encounterDate.getTime() - a.encounterDate.getTime();
    return dateDiff !== 0 ? dateDiff : b.id - a.id;
  });

  const referencedPlayerIds = new Set<number>();
  for (const e of encounters) {
    for (const id of [...teamIds(e.team1), ...teamIds(e.team2)]) referencedPlayerIds.add(id);
  }
  const referencedPlayers = await prisma.player.findMany({
    where: { id: { in: Array.from(referencedPlayerIds) } },
  });
  const playerById = new Map(referencedPlayers.map((p) => [p.id, p]));

  const records: PlayerEncounterHistoryRecord[] = encounters.map((encounter) => {
    const side = playerSide(encounter, playerId);
    const playerTeamIds = teamIds(side === 1 ? encounter.team1 : encounter.team2);
    const opponentTeamIds = teamIds(side === 1 ? encounter.team2 : encounter.team1);
    const playerTeamPoints = side === 1 ? encounter.team1SetPoints : encounter.team2SetPoints;
    const opponentTeamPoints = side === 1 ? encounter.team2SetPoints : encounter.team1SetPoints;

    const breakdown = playerTeamBreakdown(encounter, playerId);
    let calculatedScore: number;
    if (breakdown) {
      calculatedScore = breakdown.finalScore;
    } else {
      // Pre-breakdown encounters: calculatedScore is stored as Math.abs(team1Score); sign is
      // re-inferred from win/loss (a tie leaves it positive, matching the Java `<` check).
      calculatedScore = encounter.calculatedScore ?? 0;
      if (playerTeamPoints < opponentTeamPoints) calculatedScore *= -1;
    }

    return {
      encounterDate: toDateOnlyString(encounter.encounterDate),
      encounterId: encounter.id,
      encounterScore: calculatedScore,
      opponentTeam: opponentTeamIds.map((id) => playerRef(playerById.get(id) ?? null, id)),
      opponentTeamPoints,
      playerTeam: playerTeamIds.map((id) => playerRef(playerById.get(id) ?? null, id)),
      playerTeamPoints,
      scoreBreakdown: breakdown,
      groupIndex: encounter.groupIndex,
      totalGroups: encounter.totalGroups,
    };
  });

  return { playerName: currentPlayer.name, playerId: currentPlayer.id, encounterHistory: records };
}

// EncounterService.getPlayerEncounterHistory(teamAp1, teamAp2, teamBp1, teamBp2) - cross-player
// lookup used by /encounters-for-players.
export async function getCrossPlayerEncounterHistory(
  teamAp1: number,
  teamAp2: number | null,
  teamBp1: number | null,
  teamBp2: number | null
): Promise<PlayerEncounterHistoryRecord[]> {
  if (!teamAp1) return [];

  const base = await getPlayerEncounterHistory(teamAp1);
  // Original calls .getEncounterHistory() on the result without a null check - throws if
  // teamAp1 doesn't exist, same as here.
  if (!base) throw new Error(`Player not found: ${teamAp1}`);
  let history = base.encounterHistory;

  // `p.playerId` (not `p?.playerId`) deliberately throws on a null team member, matching the
  // Java original's `w.getPlayerId()` NPE for the same deleted-player edge case.
  if (teamAp2) {
    history = history.filter((e) => e.playerTeam.some((p) => (p as PlayerRef).playerId === teamAp2));
  }
  if (teamBp1) {
    history = history.filter((e) => e.opponentTeam.some((p) => (p as PlayerRef).playerId === teamBp1));
  }
  if (teamBp2) {
    history = history.filter((e) => e.opponentTeam.some((p) => (p as PlayerRef).playerId === teamBp2));
  }

  return history;
}
