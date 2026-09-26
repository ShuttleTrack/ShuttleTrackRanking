import { RankingHistoryData } from '@/types/rankings';
import { parseISO, subDays, format } from 'date-fns';
import { publicDisplayName } from '@/utils/string';
import { getAllPlayersHistory } from '@/lib/ranking/players';

interface PlayerHistory {
  playerName: string;
  playerId: number;
  history: {
    date: string;
    // Nullable, unlike the Java DTO's primitive int (which would actually NPE on an
    // unboxed-null player_old_rank/player_new_rank) - see MIGRATION_PLAN.md Phase 1's finding
    // that these columns are nullable in the real DB despite the Java entity assuming otherwise.
    oldRank: number | null;
    newRank: number | null;
  }[];
}

export const getRankingHistory = async (squadId: number): Promise<RankingHistoryData[]> => {
  const data = (await getAllPlayersHistory(squadId, 'RANK')) as PlayerHistory[];

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
      const playerNameCapitalized = publicDisplayName(player.playerName);
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
      player: publicDisplayName(playerHistory.playerName), 
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