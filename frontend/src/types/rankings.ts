export interface RankingStats {
  totalPlayers: number;
  topScore: number;
  averageScore: number;
}

export interface PlayerRankingData {
  id: number;
  name: string;
  playerRank: number;
  previousRank: number;
  rankScore: number;
  highestRank: number;
  timeInHighestRank: string;
  rankChange: {
    direction: 'up' | 'down' | 'none';
    amount: number;
  };
  isAboveAverage: boolean;
  lastFive: ('W' | 'L')[];
  winRate: number;
  lastGameDayNet: number | null;
}

export interface RankingsResponse {
  stats: RankingStats;
  players: PlayerRankingData[];
}

export interface SquadChip {
  slug: string;
  name: string;
}

export interface PublicPlayerRankingData {
  id: number;
  name: string;
  playerRank: number;
  rankScore: number;
  squadSlug: string;
  squadName: string;
  squads: SquadChip[];
  lastFive: ('W' | 'L')[];
  winRate: number;
}

export interface PublicRankingsResponse {
  stats: RankingStats;
  players: PublicPlayerRankingData[];
}

export interface RankingHistoryData {
  date: string;
  [playerName: string]: string | number | null;
} 