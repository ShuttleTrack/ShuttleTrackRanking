import React, { useEffect, useMemo, useState } from 'react';
import { Disclosure } from '@headlessui/react';
import { ChevronUpIcon } from '@heroicons/react/24/solid';
import type { Encounter } from '@/types/encounter';
import { capitalizeFirstLetter } from '@/utils/string';
import { usePlayers } from '@/hooks/usePlayers';
import type { Player } from '@/types/player';
import { usePlayerEncounters } from '@/hooks/usePlayerEncounters';
import RankBadge from '@/components/leaderboard/RankBadge';
import TrendIndicator from '@/components/leaderboard/TrendIndicator';
import FormBars from '@/components/leaderboard/FormBars';
import LastGameDayNet from '@/components/leaderboard/LastGameDayNet';
import StatCard from '@/components/encounters/StatCard';
import EncounterCard from '@/components/encounters/EncounterCard';
import EncounterDesktopHeader from '@/components/encounters/EncounterDesktopHeader';
import type { FormResult } from '@/utils/playerForm';
import { PageLoader } from '@/components/common/GameLoader';

interface PlayerEncountersComponentProps {
  playerId: string | string[] | undefined;
}

function rankChangeFromPlayer(player: Player) {
  const delta = player.previousRank - player.playerRank;
  return {
    direction: delta > 0 ? 'up' as const : delta < 0 ? 'down' as const : 'none' as const,
    amount: Math.abs(delta),
  };
}

function lastFiveFromEncounters(encountersByDate: Record<string, Encounter[]>): FormResult[] {
  const all = Object.values(encountersByDate).flat();
  const sorted = [...all].sort((a, b) => {
    const d = a.encounterDate.localeCompare(b.encounterDate);
    if (d !== 0) return d;
    return a.encounterId - b.encounterId;
  });
  return sorted.slice(-5).map((e) =>
    e.playerTeamPoints > e.opponentTeamPoints ? 'W' : 'L',
  );
}

function formatGroupDate(dateKey: string): string {
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString();
}

const PlayerEncountersCompactComponent: React.FC<PlayerEncountersComponentProps> = ({ playerId }) => {
  const { players, isLoading: playersLoading } = usePlayers();
  const { encounters, isLoading: encountersLoading, error } = usePlayerEncounters(playerId);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!playersLoading && players.length > 0) {
      const foundPlayer = players.find((p: Player) => p.id === Number(playerId));
      setPlayer(foundPlayer || null);
    }
  }, [players, playerId, playersLoading]);

  const lastFive = useMemo(() => {
    if (!encounters) return [];
    return lastFiveFromEncounters(encounters.encountersByDate);
  }, [encounters]);

  if (encountersLoading || playersLoading) {
    return <PageLoader variant="compact" label="Loading player history" />;
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-6 py-4 text-red-300">
          Error fetching encounters: {error.message}
        </div>
      </div>
    );
  }

  if (!encounters) return null;

  const { stats, encountersByDate, scoreSumByDate } = encounters;
  const displayName = player ? capitalizeFirstLetter(player.name) : 'Player';
  const title = `${displayName}'s History`;
  const winRateDisplay = `${stats.winRate.toFixed(1)}%`;

  const showRankStrip = player && player.playerRank > 0;

  return (
    <div className="pb-8">
      <section className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 mb-4 sm:mb-6">
        <div className="md:flex md:flex-wrap md:items-start md:justify-between md:gap-x-4 md:gap-y-3">
          <div className="min-w-0 md:flex-1">
            <div className="flex items-center justify-between gap-3 md:block">
              <h1 className="min-w-0 flex-1 font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
                {title}
              </h1>
              {showRankStrip ? (
                <div className="flex-shrink-0 md:hidden">
                  <TrendIndicator rankChange={rankChangeFromPlayer(player)} variant="default" />
                </div>
              ) : null}
            </div>
            <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
            {showRankStrip ? (
              <div className="mt-4 flex items-center justify-between md:hidden">
                <RankBadge rank={player.playerRank} variant="default" />
                {lastFive.length > 0 ? (
                  <div className="flex flex-col gap-1 items-end">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60">
                      Last 5
                    </p>
                    <FormBars results={lastFive} variant="default" align="start" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {showRankStrip ? (
            <div className="hidden md:flex flex-wrap items-center gap-4 sm:gap-6 justify-end flex-shrink-0">
              <RankBadge rank={player.playerRank} variant="default" />
              <TrendIndicator rankChange={rankChangeFromPlayer(player)} variant="default" />
              {lastFive.length > 0 ? (
                <div className="flex flex-col gap-1 items-end">
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60">
                    Last 5
                  </p>
                  <FormBars results={lastFive} variant="default" align="start" />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 mb-6 sm:mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <StatCard label="Games" value={stats.totalGames} />
          <StatCard label="Wins" value={stats.wins} tone="win" />
          <StatCard label="Losses" value={stats.losses} tone="loss" />
          <StatCard label="Win Rate" value={winRateDisplay} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-2">
        {Object.entries(encountersByDate).map(([date, dayEncounters], idx) => (
          <Disclosure
            key={date}
            as="div"
            className="rounded-xl overflow-hidden border border-gray-600"
            defaultOpen={idx === 0}
          >
            {({ open }) => (
              <>
                <Disclosure.Button
                  className="flex justify-between items-center w-full px-4 py-3 text-left bg-surface-container/90 hover:bg-surface-container-high/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="font-headline font-semibold text-on-surface">
                    {formatGroupDate(date)}
                  </span>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60 sm:hidden">
                        Net
                      </span>
                      <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60 hidden sm:inline">
                        Net score
                      </span>
                      <LastGameDayNet value={scoreSumByDate[date] ?? 0} variant="default" size="lg" />
                    </div>
                    <ChevronUpIcon
                      className={`h-5 w-5 text-on-surface-variant transition-transform duration-150 ${
                        open ? 'rotate-180' : ''
                      }`}
                      aria-hidden
                    />
                  </div>
                </Disclosure.Button>
                <Disclosure.Panel className="px-2 sm:px-3 pb-3 pt-2 bg-background/50 space-y-1.5">
                  <EncounterDesktopHeader />
                  {dayEncounters.map((encounter) => (
                    <EncounterCard key={encounter.encounterId} encounter={encounter} />
                  ))}
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
        ))}
      </div>
    </div>
  );
};

export default PlayerEncountersCompactComponent;
