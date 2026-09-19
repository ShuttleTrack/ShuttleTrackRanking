import type { RawEncounter } from './playerForm';

const ENCOUNTER_SEPARATOR = ':';

interface TeamScoreBreakdownJson {
  baseElo: number;
  tierAdjustment: number;
  consolation: number;
  finalScore: number;
}

interface ScoreBreakdownJson {
  team1: TeamScoreBreakdownJson;
  team2: TeamScoreBreakdownJson;
}

function parseTeamIds(team: string): number[] {
  return team
    .split(ENCOUNTER_SEPARATOR)
    .map((id) => Number(id.trim()))
    .filter((id) => !Number.isNaN(id));
}

function getPlayerTeam(encounter: RawEncounter, playerId: number): 1 | 2 | null {
  const onTeam1 = parseTeamIds(encounter.team1).includes(playerId);
  const onTeam2 = parseTeamIds(encounter.team2).includes(playerId);
  if (onTeam1) return 1;
  if (onTeam2) return 2;
  return null;
}

function getPlayerTeamBreakdown(
  encounter: RawEncounter,
  playerId: number
): TeamScoreBreakdownJson | null {
  if (!encounter.scoreBreakdown) {
    return null;
  }
  try {
    const parsed = JSON.parse(encounter.scoreBreakdown) as ScoreBreakdownJson;
    const team = getPlayerTeam(encounter, playerId);
    if (team === 1) return parsed.team1;
    if (team === 2) return parsed.team2;
    return null;
  } catch {
    return null;
  }
}

export function encounterScoreForPlayer(
  encounter: RawEncounter,
  playerId: number
): number | null {
  const team = getPlayerTeam(encounter, playerId);
  if (team === null) {
    return null;
  }

  const playerTeamPoints = team === 1 ? encounter.team1SetPoints : encounter.team2SetPoints;
  const opponentTeamPoints = team === 1 ? encounter.team2SetPoints : encounter.team1SetPoints;

  const playerBreakdown = getPlayerTeamBreakdown(encounter, playerId);
  if (playerBreakdown != null) {
    return playerBreakdown.finalScore;
  }

  if (encounter.calculatedScore == null || Number.isNaN(encounter.calculatedScore)) {
    return null;
  }

  let score = encounter.calculatedScore;
  if (playerTeamPoints < opponentTeamPoints) {
    score *= -1;
  }
  return score;
}

export function computeLastGameDayNet(
  playerId: number,
  encounters: RawEncounter[]
): number | null {
  const playerEncounters = encounters.filter(
    (e) => e.processed && getPlayerTeam(e, playerId) !== null
  );

  if (playerEncounters.length === 0) {
    return null;
  }

  const lastDate = playerEncounters.reduce(
    (max, e) => (e.encounterDate > max ? e.encounterDate : max),
    playerEncounters[0].encounterDate
  );

  const onLastDay = playerEncounters.filter((e) => e.encounterDate === lastDate);

  let total = 0;
  let hasScore = false;
  for (const encounter of onLastDay) {
    const score = encounterScoreForPlayer(encounter, playerId);
    if (score !== null) {
      total += score;
      hasScore = true;
    }
  }

  return hasScore ? Math.round(total * 100) / 100 : null;
}

export function buildLastGameDayNetByPlayerId(
  playerIds: number[],
  encounters: RawEncounter[]
): Map<number, number | null> {
  const map = new Map<number, number | null>();
  for (const id of playerIds) {
    map.set(id, computeLastGameDayNet(id, encounters));
  }
  return map;
}
