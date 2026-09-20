import type { Encounter } from '@/types/encounter';

export interface EncounterTeamQuery {
  teamA1: number;
  teamA2: number;
  teamB1: number;
  teamB2: number;
}

export const EMPTY_ENCOUNTER_TEAM_QUERY: EncounterTeamQuery = {
  teamA1: 0,
  teamA2: 0,
  teamB1: 0,
  teamB2: 0,
};

function parseSlotParam(raw: string | string[] | undefined): number {
  const str = Array.isArray(raw) ? raw[0] : raw;
  if (!str) return 0;
  const n = Number(str);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function parseEncounterQuery(
  query: Record<string, string | string[] | undefined>,
): EncounterTeamQuery {
  return {
    teamA1: parseSlotParam(query.a1),
    teamA2: parseSlotParam(query.a2),
    teamB1: parseSlotParam(query.b1),
    teamB2: parseSlotParam(query.b2),
  };
}

export function buildEncounterQuery(slots: EncounterTeamQuery): Record<string, string> {
  const q: Record<string, string> = {};
  if (slots.teamA1) q.a1 = String(slots.teamA1);
  if (slots.teamA2) q.a2 = String(slots.teamA2);
  if (slots.teamB1) q.b1 = String(slots.teamB1);
  if (slots.teamB2) q.b2 = String(slots.teamB2);
  return q;
}

export function duplicateTeamPlayerError(slots: EncounterTeamQuery): string | null {
  const selected = [slots.teamA1, slots.teamA2, slots.teamB1, slots.teamB2].filter((id) => id !== 0);
  const unique = new Set(selected);
  if (selected.length !== unique.size) {
    return "A player can't be selected multiple times";
  }
  return null;
}

export function hasAnyTeamSelection(slots: EncounterTeamQuery): boolean {
  return slots.teamA1 !== 0 || slots.teamA2 !== 0 || slots.teamB1 !== 0 || slots.teamB2 !== 0;
}

export interface EncounterSummary {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
}

export function summarizeEncounters(encounters: Encounter[]): EncounterSummary {
  let wins = 0;
  for (const e of encounters) {
    if (e.playerTeamPoints > e.opponentTeamPoints) wins += 1;
  }
  const totalGames = encounters.length;
  const losses = totalGames - wins;
  const winRate = totalGames === 0 ? 0 : (wins / totalGames) * 100;
  return { totalGames, wins, losses, winRate };
}

export interface GroupedEncounters {
  encountersByDate: Record<string, Encounter[]>;
  scoreSumByDate: Record<string, number>;
  dateKeys: string[];
}

export function groupEncountersByDate(encounters: Encounter[]): GroupedEncounters {
  const encountersByDate: Record<string, Encounter[]> = {};
  const scoreSumByDate: Record<string, number> = {};

  for (const encounter of encounters) {
    const date = encounter.encounterDate;
    if (!encountersByDate[date]) {
      encountersByDate[date] = [];
    }
    encountersByDate[date].push(encounter);
    scoreSumByDate[date] = (scoreSumByDate[date] ?? 0) + encounter.encounterScore;
  }

  const dateKeys = Object.keys(encountersByDate).sort((a, b) => b.localeCompare(a));
  return { encountersByDate, scoreSumByDate, dateKeys };
}

export function formatEncounterGroupDate(dateKey: string): string {
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString();
}

export function buildEncounterHistoryUrl(slots: EncounterTeamQuery): string | null {
  if (!slots.teamA1) return null;
  const { teamA1, teamA2, teamB1, teamB2 } = slots;
  return `/api/encounters/history?teamA1=${teamA1}&teamA2=${teamA2}&teamB1=${teamB1}&teamB2=${teamB2}`;
}
