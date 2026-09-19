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

export interface RankingHistoryData {
  date: string;
  [playerName: string]: string | number | null;
} 