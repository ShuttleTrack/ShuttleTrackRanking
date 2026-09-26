import { publicDisplayName } from '@/utils/string';
import type { RankingHistoryData } from '@/types/rankings';
import type { PlayerRankingData } from '@/types/rankings';

export interface RankSeriesPoint {
  date: string;
  rank: number;
}

export interface RankChangeRow {
  date: string;
  oldRank: number;
  newRank: number;
  rankChange: {
    direction: 'up' | 'down' | 'none';
    amount: number;
  };
}

export function historyKeyForPlayerName(name: string): string {
  return publicDisplayName(name);
}

export function sortedHistoryDates(history: RankingHistoryData[]): string[] {
  return [...history].map((row) => row.date).sort((a, b) => a.localeCompare(b));
}

/** Earliest date row — synthetic padding from rankingHistoryService post-process. */
export function syntheticPaddingDate(history: RankingHistoryData[]): string | null {
  const dates = sortedHistoryDates(history);
  return dates[0] ?? null;
}

export function buildPlayerRankSeries(
  history: RankingHistoryData[],
  playerKey: string,
): RankSeriesPoint[] {
  const padding = syntheticPaddingDate(history);
  const dates = sortedHistoryDates(history);

  const points: RankSeriesPoint[] = [];
  for (const date of dates) {
    const row = history.find((r) => r.date === date);
    const raw = row?.[playerKey];
    if (raw === null || raw === undefined) continue;
    const rank = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(rank)) continue;
    if (date === padding) {
      points.push({ date, rank });
      continue;
    }
    points.push({ date, rank });
  }
  return points;
}

function rankChangeFromDelta(delta: number): RankChangeRow['rankChange'] {
  if (delta > 0) {
    return { direction: 'up', amount: delta };
  }
  if (delta < 0) {
    return { direction: 'down', amount: Math.abs(delta) };
  }
  return { direction: 'none', amount: 0 };
}

export function buildRankChangeRows(
  history: RankingHistoryData[],
  playerKey: string,
): RankChangeRow[] {
  const padding = syntheticPaddingDate(history);
  const series = buildPlayerRankSeries(history, playerKey);
  const rows: RankChangeRow[] = [];

  for (let i = 0; i < series.length; i++) {
    const { date, rank: newRank } = series[i];
    if (date === padding) continue;

    const prevRank = i > 0 ? series[i - 1].rank : newRank;
    const delta = prevRank - newRank;
    rows.push({
      date,
      oldRank: prevRank,
      newRank,
      rankChange: rankChangeFromDelta(delta),
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function resolveDefaultPlayerId(
  players: Pick<PlayerRankingData, 'id' | 'playerRank'>[],
  options?: { sessionPlayerId?: number; queryPlayerId?: number },
): number | null {
  const { sessionPlayerId, queryPlayerId } = options ?? {};
  const ids = new Set(players.map((p) => p.id));

  if (queryPlayerId !== undefined && ids.has(queryPlayerId)) {
    return queryPlayerId;
  }
  if (sessionPlayerId !== undefined && ids.has(sessionPlayerId)) {
    return sessionPlayerId;
  }

  const ranked = players
    .filter((p) => p.playerRank > 0)
    .sort((a, b) => a.playerRank - b.playerRank);
  if (ranked.length > 0) return ranked[0].id;
  return players[0]?.id ?? null;
}

export function chartYDomain(ranks: number[]): [number, number] {
  if (ranks.length === 0) return [1, 10];
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const pad = Math.max(1, Math.ceil((max - min) * 0.1));
  return [Math.max(1, min - pad), max + pad];
}

export function mergeHistoryForChart(
  history: RankingHistoryData[],
  playerKeys: string[],
): RankingHistoryData[] {
  const dates = sortedHistoryDates(history);
  return dates.map((date) => {
    const row = history.find((r) => r.date === date) ?? { date };
    const merged: RankingHistoryData = { date };
    for (const key of playerKeys) {
      const value = row[key];
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  });
}

export function playerKeysInHistory(history: RankingHistoryData[]): string[] {
  if (history.length === 0) return [];
  const keys = new Set<string>();
  for (const row of history) {
    for (const key of Object.keys(row)) {
      if (key !== 'date') keys.add(key);
    }
  }
  return Array.from(keys);
}
