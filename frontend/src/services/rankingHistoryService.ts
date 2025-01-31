import { RankingHistoryData } from '@/types/rankings';
import { parseISO, subDays, format } from 'date-fns';
import { capitalizeFirstLetter } from '@/utils/string';

interface PlayerHistory {
  playerName: string;
  playerId: number;
  history: {
    date: string;
    oldRank: number;
    newRank: number;
  }[];
}

export const getRankingHistory = async (): Promise<RankingHistoryData[]> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/players/history?type=RANK`);
  if (!response.ok) {
    throw new Error('Failed to fetch ranking history');
  }
  const data: PlayerHistory[] = await response.json();
  
  // Transform data for graph
  let graphData = transformDataForGraph(data);
  
  // Post-process data to add previous dates
  return postProcessDataToAddPreviousDates(graphData, data);
};

const transformDataForGraph = (players: PlayerHistory[]): RankingHistoryData[] => {
  let graphData: RankingHistoryData[] = [];
  players.forEach((player) => {
    player.history.forEach((entry) => {
      let existingDateEntry = graphData.find((e) => e.date === entry.date);
      const playerNameCapitalized = capitalizeFirstLetter(player.playerName);
      if (existingDateEntry) {
        existingDateEntry[playerNameCapitalized] = entry.newRank;
      } else {
        const newEntry: RankingHistoryData = {
          date: entry.date,
          [playerNameCapitalized]: entry.newRank,
        };
        graphData.push(newEntry);
      }
    });
  });

  graphData.sort(
    (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime(),
  );
  return graphData;
};

const postProcessDataToAddPreviousDates = (
  ranksPerDateArr: RankingHistoryData[], 
  historyPerPlayerArr: PlayerHistory[]
): RankingHistoryData[] => {
  // Defining a virtual starting date 7 days before the available first date
  let startingDate = subDays(parseISO(ranksPerDateArr[0].date), 7);

  const playerToInitialOldRankMap = historyPerPlayerArr.map((playerHistory) => {
    const sortedHistory = playerHistory.history.sort(
      (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime(),
    );

    return {
      player: capitalizeFirstLetter(playerHistory.playerName), 
      initialOldRank: sortedHistory[0].oldRank
    };
  });

  ranksPerDateArr.unshift({ date: format(startingDate, 'yyyy-MM-dd') });
  let playedAdded: string[] = [];
  ranksPerDateArr.reverse().forEach((e) => {
    for (let item of playerToInitialOldRankMap) {
      if (!(playedAdded.includes(item.player)) && !(item.player in e)) {
        e[item.player] = item.initialOldRank;
        playedAdded.push(item.player);
      } else if(!(item.player in e)) {
        e[item.player] = null;
      }
    }
  });

  ranksPerDateArr.reverse();
  return ranksPerDateArr;
}; 