import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayers } from '@/hooks/usePlayers';
import { useRankingHistory } from '@/hooks/useRankingHistory';
import { PageLoader } from '@/components/common/GameLoader';
import type { RowVariant } from '@/components/leaderboard/RankBadge';
import PlayerPicker from '@/components/ranking-history/PlayerPicker';
import RankTrajectoryChart from '@/components/ranking-history/RankTrajectoryChart';
import RankChangeList from '@/components/ranking-history/RankChangeList';
import { useSquad } from '@/contexts/SquadContext';
import {
  buildRankChangeRows,
  historyKeyForPlayerName,
  resolveDefaultPlayerId,
} from '@/utils/rankHistory';

function variantForRank(rank: number): RowVariant {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  if (rank === 4) return 'dark';
  return 'default';
}

function useIsMdUp(): boolean {
  const [isMd, setIsMd] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsMd(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMd;
}

const RankingHistoryView = () => {
  const router = useRouter();
  const { slug } = useSquad();
  const isMdUp = useIsMdUp();
  const { players, isLoading: playersLoading, error: playersError } = usePlayers();
  const { rankingHistory, isLoading: historyLoading, error: historyError } = useRankingHistory();

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [activeChartDate, setActiveChartDate] = useState<string | null>(null);
  const [listHighlightDate, setListHighlightDate] = useState<string | null>(null);

  const queryPlayerId = useMemo(() => {
    const raw = router.query.player;
    const str = Array.isArray(raw) ? raw[0] : raw;
    if (!str) return undefined;
    const n = Number(str);
    return Number.isInteger(n) ? n : undefined;
  }, [router.query.player]);

  const activePlayers = useMemo(
    () => players.filter((p) => p.playerRank > 0),
    [players],
  );

  useEffect(() => {
    if (playersLoading || activePlayers.length === 0) return;
    if (selectedPlayerId !== null && activePlayers.some((p) => p.id === selectedPlayerId)) {
      return;
    }
    const defaultId = resolveDefaultPlayerId(activePlayers, { queryPlayerId });
    setSelectedPlayerId(defaultId);
  }, [playersLoading, activePlayers, selectedPlayerId, queryPlayerId]);

  const selectPlayer = useCallback(
    (playerId: number) => {
      setSelectedPlayerId(playerId);
      setActiveChartDate(null);
      setListHighlightDate(null);
      router.replace(
        { pathname: router.pathname, query: { ...router.query, player: String(playerId) } },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );

  const playerColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of players) {
      map[historyKeyForPlayerName(p.name)] = p.colorHex;
    }
    return map;
  }, [players]);

  const selectedKey = selectedPlayer
    ? historyKeyForPlayerName(selectedPlayer.name)
    : '';

  const changeRows = useMemo(
    () => (selectedKey ? buildRankChangeRows(rankingHistory, selectedKey) : []),
    [rankingHistory, selectedKey],
  );

  const highlightDate = listHighlightDate ?? activeChartDate;

  const activeRankChange = useMemo(() => {
    if (!highlightDate) return null;
    return changeRows.find((r) => r.date === highlightDate) ?? null;
  }, [changeRows, highlightDate]);

  if (playersLoading || historyLoading) {
    return <PageLoader variant="compact" label="Loading ranking history" />;
  }

  const error = playersError ?? historyError;
  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-6 py-4 text-red-300">
          Error loading ranking history: {error.message}
        </div>
      </div>
    );
  }

  if (!selectedPlayer || !selectedKey) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-center text-on-surface-variant">
        No active players to show.
      </div>
    );
  }

  const rowVariant = variantForRank(selectedPlayer.playerRank);

  return (
    <div className="pb-8">
      <section className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 mb-4 sm:mb-6">
        <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
          Ranking History
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
        <p className="mt-2 text-sm sm:text-base text-on-surface-variant max-w-2xl">
          Track how each player&apos;s standing has moved after every game day.
        </p>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-4 sm:space-y-6">
        <section className="rounded-xl border border-gray-600 bg-surface-container p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-label text-xs uppercase tracking-wide text-on-surface-variant">
              Player
            </p>
            <Link
              href={`/s/${slug}/player/${selectedPlayer.id}/encounters`}
              className="font-headline text-xs font-semibold text-primary hover:text-primary-container shrink-0"
            >
              Match history
            </Link>
          </div>
          <PlayerPicker
            players={players}
            selectedPlayerId={selectedPlayerId}
            onSelect={selectPlayer}
          />
        </section>

        <section className="rounded-xl border border-gray-600 bg-surface-container p-3 sm:p-4">
          <p className="font-label text-xs uppercase tracking-wide text-on-surface-variant mb-3">
            Rank over time
          </p>
          <p className="text-xs text-on-surface-variant mb-2 md:hidden">
            Tap the chart to see rank on a date.
          </p>
          <RankTrajectoryChart
            history={rankingHistory}
            selectedPlayerKey={selectedKey}
            playerColors={playerColors}
            highlightDate={highlightDate}
            activeDate={activeChartDate}
            activeRankChange={activeRankChange}
            onChartClick={setActiveChartDate}
            showBackgroundLines={isMdUp}
          />
        </section>

        <section className="rounded-xl border border-gray-600 bg-surface-container overflow-hidden">
          <div className="border-b border-gray-600 px-3 py-2 sm:px-4 sm:py-3">
            <h2 className="font-label text-xs font-bold uppercase tracking-wide text-on-surface-variant flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              Game day changes
            </h2>
          </div>
          <RankChangeList
            rows={changeRows}
            selectedDate={listHighlightDate}
            onSelectDate={(date) => {
              setListHighlightDate(date);
              setActiveChartDate(date);
            }}
            rowVariant={rowVariant}
          />
        </section>
      </div>
    </div>
  );
};

export default RankingHistoryView;
