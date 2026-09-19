export type FormResult = 'W' | 'L';

export interface RawEncounter {
  id?: number;
  team1: string;
  team2: string;
  encounterDate: string;
  processed: boolean;
  team1SetPoints: number;
  team2SetPoints: number;
}

export interface PlayerFormStats {
  lastFive: FormResult[];
  winRate: number;
  totalGames: number;
}

const ENCOUNTER_SEPARATOR = ':';

function parseTeamIds(team: string): number[] {
  return team.split(ENCOUNTER_SEPARATOR).map((id) => Number(id.trim())).filter((id) => !Number.isNaN(id));
}

function isPlayerWin(encounter: RawEncounter, playerId: number): boolean | null {
  const team1Ids = parseTeamIds(encounter.team1);
  const team2Ids = parseTeamIds(encounter.team2);
  const onTeam1 = team1Ids.includes(playerId);
  const onTeam2 = team2Ids.includes(playerId);

  if (!onTeam1 && !onTeam2) {
    return null;
  }

  if (encounter.team1SetPoints === encounter.team2SetPoints) {
    return null;
  }

  if (onTeam1) {
    return encounter.team1SetPoints > encounter.team2SetPoints;
  }
  return encounter.team2SetPoints > encounter.team1SetPoints;
}

function compareEncounters(a: RawEncounter, b: RawEncounter): number {
  const dateCompare = a.encounterDate.localeCompare(b.encounterDate);
  if (dateCompare !== 0) {
    return dateCompare;
  }
  return (a.id ?? 0) - (b.id ?? 0);
}

export function computePlayerFormStats(
  playerId: number,
  encounters: RawEncounter[]
): PlayerFormStats {
  const playerEncounters = encounters
    .filter((e) => e.processed)
    .map((e) => ({ encounter: e, win: isPlayerWin(e, playerId) }))
    .filter((entry): entry is { encounter: RawEncounter; win: boolean } => entry.win !== null)
    .sort((a, b) => compareEncounters(a.encounter, b.encounter));

  const totalGames = playerEncounters.length;
  const wins = playerEncounters.filter((e) => e.win).length;
  const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

  const lastFiveChronological = playerEncounters.slice(-5).map((e) => (e.win ? 'W' : 'L') as FormResult);

  return {
    lastFive: lastFiveChronological,
    winRate,
    totalGames,
  };
}

export function buildFormStatsByPlayerId(
  playerIds: number[],
  encounters: RawEncounter[]
): Map<number, PlayerFormStats> {
  const map = new Map<number, PlayerFormStats>();
  for (const id of playerIds) {
    map.set(id, computePlayerFormStats(id, encounters));
  }
  return map;
}
