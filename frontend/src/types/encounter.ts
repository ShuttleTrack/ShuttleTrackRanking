export interface EncounterPlayer {
  playerName: string;
  playerId: number;
}

export interface ScoreBreakdown {
  baseElo: number;
  tierAdjustment: number;
  consolation: number;
  finalScore: number;
}

export interface Encounter {
  encounterDate: string;
  encounterId: number;
  encounterScore: number;
  opponentTeam: EncounterPlayer[];
  opponentTeamPoints: number;
  playerTeam: EncounterPlayer[];
  playerTeamPoints: number;
  scoreBreakdown?: ScoreBreakdown | null;
  groupIndex?: number | null;
  totalGroups?: number | null;
}

export interface EncountersResponse {
  playerName: string;
  playerId: number;
  encounterHistory: Encounter[];
}
