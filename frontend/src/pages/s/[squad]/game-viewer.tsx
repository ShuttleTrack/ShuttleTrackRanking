import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { usePlayers } from '@/hooks/usePlayers';
import { useState, useEffect, useMemo } from 'react';
import { getMatchCombinations } from '@/utils/match';
import MatchResultLegend from '@/components/matches/MatchResultLegend';
import MatchScoreRow from '@/components/matches/MatchScoreRow';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadOrNotFound } from '@/lib/squadPage';
import { publicDisplayName } from '@/utils/string';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';

const outlineBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 px-6 py-3 font-medium text-on-surface transition-colors hover:border-primary/40';

interface LiveGame {
  id: string;
  groups: Record<string, number[]>;
  scores: Record<string, Record<string, { team1Score: number; team2Score: number }>>;
  status: string;
}

function countCompletedMatches(scores: LiveGame['scores']): number {
  return Object.values(scores).reduce((total, groupScores) => {
    return (
      total +
      Object.values(groupScores).filter(
        (score) => score.team1Score > 0 || score.team2Score > 0
      ).length
    );
  }, 0);
}

function countTotalMatches(groups: LiveGame['groups']): number {
  return Object.values(groups).reduce((total, group) => {
    return total + (group.length === 4 ? 3 : 5);
  }, 0);
}

const useGameLiveUpdates = (squadId: number, gameId: string | undefined) => {
  const [liveGame, setLiveGame] = useState<LiveGame | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    try {
      const eventSource = new EventSource(`/api/squads/${squadId}/games/${gameId}/live`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setLiveGame(data);
        setIsLoading(false);
      };

      eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        eventSource.close();
        setIsLoading(false);
      };

      return () => {
        eventSource.close();
      };
    } catch (error) {
      console.error('SSE Setup Error:', error);
      setIsLoading(false);
    }
  }, [squadId, gameId]);

  return { liveGame, isLoading };
};

const GameViewer = () => {
  const router = useRouter();
  const { id: squadId, slug } = useSquad();
  const gameId = router.query.gameId as string;
  const { players, isLoading: playersLoading } = usePlayers();
  const { liveGame, isLoading: gameLoading } = useGameLiveUpdates(squadId, gameId);

  const getPlayerName = (id: number) => {
    const player = players.find((p) => p.id === id);
    return player ? publicDisplayName(player.name) : `Player ${id}`;
  };

  const { completed, total, progressPct } = useMemo(() => {
    if (!liveGame) {
      return { completed: 0, total: 0, progressPct: 0 };
    }
    const completed = countCompletedMatches(liveGame.scores);
    const total = countTotalMatches(liveGame.groups);
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, progressPct };
  }, [liveGame]);

  if (playersLoading || gameLoading) {
    return <PageLoader variant="tall" label="Loading" />;
  }

  if (!liveGame) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-center space-y-4">
          <h1 className="font-headline text-2xl font-bold text-on-surface">Game not found</h1>
          <p className="text-on-surface-variant">
            The game you&apos;re looking for doesn&apos;t exist
          </p>
          <button type="button" className={outlineBtn} onClick={() => router.push(`/s/${slug}`)}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-4 sm:mt-8 pb-6 sm:pb-8">
      <header className="mb-4 sm:mb-8 flex flex-col items-center text-center">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-on-surface">
            Game #{gameId.slice(-4)}
          </h1>
          <span className="inline-flex items-center" aria-label="Live">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-safe:animate-ping" aria-hidden />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" aria-hidden />
            </span>
          </span>
        </div>
        <div className="mt-2 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      </header>

      <section className="mb-3 sm:mb-8 rounded-xl border border-gray-600 bg-surface-container p-3 sm:p-5">
        <div className="mb-2 sm:mb-3 flex items-center justify-between gap-4">
          <span className="font-label text-xs uppercase tracking-wide text-on-surface-variant">
            Match progress
          </span>
          <span className="font-numeric text-sm font-semibold text-on-surface tabular-nums">
            {completed} / {total}
          </span>
        </div>
        <div className="h-1.5 sm:h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </section>

      <MatchResultLegend className="mb-3 sm:mb-6" />

      <div className="space-y-3 sm:space-y-6">
        {Object.entries(liveGame.groups).map(([groupName, playerIds]) => {
          const matches = getMatchCombinations(playerIds.map((id) => getPlayerName(id)));

          return (
            <section
              key={groupName}
              className="rounded-xl border border-gray-600 bg-surface-container overflow-hidden"
            >
              <div className="border-b border-gray-600 px-3 py-2 sm:px-4 sm:py-3">
                <h2 className="font-label text-xs font-bold uppercase tracking-wide text-on-surface-variant flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {groupName}
                </h2>
              </div>
              <div className="space-y-1.5 sm:space-y-3 p-2 sm:p-4">
                {matches.map((match, idx) => {
                  const matchScore = liveGame.scores[groupName]?.[idx];
                  return (
                    <MatchScoreRow
                      key={idx}
                      team1={match.team1}
                      team2={match.team2}
                      team1Score={matchScore?.team1Score ?? 0}
                      team2Score={matchScore?.team2Score ?? 0}
                      showResultChips={false}
                      compact
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default GameViewer;

// Public - no login required (SQUAD_TENANCY_PLAN.md: game viewer stays a public board).
export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadOrNotFound(context);
};
