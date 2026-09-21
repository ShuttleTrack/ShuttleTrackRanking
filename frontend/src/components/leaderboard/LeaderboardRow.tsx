import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { PlayerRankingData, PublicPlayerRankingData } from '@/types/rankings';
import { capitalizeFirstLetter } from '@/utils/string';
import FormBars from './FormBars';
import {
  LEADERBOARD_DESKTOP_GRID,
  PUBLIC_LEADERBOARD_DESKTOP_GRID,
} from './leaderboardGrid';
import RankBadge, { type RowVariant } from './RankBadge';
import LastGameDayNet from './LastGameDayNet';
import TrendIndicator from './TrendIndicator';
import PeakTenure from './PeakTenure';
import { useOptionalSquad } from '@/contexts/SquadContext';
import type { LeaderboardVariant } from './Leaderboard';

function variantForRank(rank: number): RowVariant {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  if (rank === 4) return 'dark';
  return 'default';
}

const rowStyles: Record<
  RowVariant,
  { style?: CSSProperties; className: string }
> = {
  gold: {
    style: {
      background:
        'linear-gradient(135deg, rgb(191, 149, 63) 0%, rgb(252, 246, 186) 45%, rgb(251, 245, 183) 50%, rgb(170, 119, 28) 100%)',
    },
    className: 'border border-white/5 shadow-xl shadow-yellow-900/10',
  },
  silver: {
    style: {
      background:
        'linear-gradient(135deg, rgb(192, 192, 192) 0%, rgb(232, 232, 232) 50%, rgb(192, 192, 192) 100%)',
    },
    className: 'border border-white/5',
  },
  bronze: {
    style: {
      background:
        'linear-gradient(135deg, rgb(169, 113, 66) 0%, rgb(227, 168, 87) 50%, rgb(169, 113, 66) 100%)',
    },
    className: 'border border-white/5',
  },
  dark: {
    style: {
      background:
        'linear-gradient(135deg, rgba(42, 48, 56, 0.9) 0%, rgba(31, 36, 42, 0.9) 50%, rgba(22, 25, 29, 0.9) 100%)',
    },
    className: 'border border-white/10 shadow-xl',
  },
  default: {
    className:
      'bg-surface-container/90 border border-gray-600 hover:border-primary/40 transition-all duration-300',
  },
};

const nameClass: Record<RowVariant, string> = {
  gold: 'text-yellow-950',
  silver: 'text-slate-900',
  bronze: 'text-orange-950',
  dark: 'text-white',
  default: 'text-on-surface',
};

const metricClass: Record<RowVariant, string> = {
  gold: 'text-yellow-950',
  silver: 'text-slate-900',
  bronze: 'text-orange-950',
  dark: 'text-secondary',
  default: 'text-on-surface',
};

const labelClass: Record<RowVariant, string> = {
  gold: 'text-yellow-900/70',
  silver: 'text-slate-700/70',
  bronze: 'text-orange-900/70',
  dark: 'text-on-surface-variant opacity-60',
  default: 'text-on-surface-variant opacity-60',
};

function isPublicPlayer(
  player: PlayerRankingData | PublicPlayerRankingData
): player is PublicPlayerRankingData {
  return 'squads' in player;
}

interface LeaderboardRowProps {
  player: PlayerRankingData | PublicPlayerRankingData;
  variant?: LeaderboardVariant;
}

const LeaderboardRow = ({ player, variant = 'squad' }: LeaderboardRowProps) => {
  const squad = useOptionalSquad();
  const rowVariant = variantForRank(player.playerRank);
  const { style, className: rowClass } = rowStyles[rowVariant];
  const squadPlayer = variant === 'squad' && !isPublicPlayer(player) ? player : null;
  const hoverBorder =
    squadPlayer?.rankChange.direction === 'down' && rowVariant === 'default'
      ? 'hover:border-red-500/20'
      : '';

  const isPublicBoard = variant === 'public';
  const slug = isPublicPlayer(player) ? player.squadSlug : squad?.slug;
  const encountersHref = slug ? `/s/${slug}/player/${player.id}/encounters` : '#';
  const nameLinkClass = isPublicBoard ? '' : 'group-hover:underline';

  const peakTenure = squadPlayer ? (
    <PeakTenure
      variant={rowVariant}
      playerRank={squadPlayer.playerRank}
      highestRank={squadPlayer.highestRank}
      timeInHighestRank={squadPlayer.timeInHighestRank}
    />
  ) : null;

  const desktopGrid =
    variant === 'public' ? PUBLIC_LEADERBOARD_DESKTOP_GRID : LEADERBOARD_DESKTOP_GRID;

  const rowContent = (
    <>
      {(rowVariant === 'gold' || rowVariant === 'dark') && (
        <div className="absolute right-0 top-0 h-full w-1/3 form-strip opacity-10 pointer-events-none" />
      )}

      <div className={`${desktopGrid} relative z-10`}>
        <div>
          <RankBadge rank={player.playerRank} variant={rowVariant} />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`min-w-0 truncate font-headline font-bold leading-tight ${nameLinkClass} ${nameClass[rowVariant]}`}
          >
            {capitalizeFirstLetter(player.name)}
          </span>
          {peakTenure}
        </div>
        <div className="flex justify-center">
          <FormBars results={player.lastFive} variant={rowVariant} />
        </div>
        <div className="text-center">
          <span className={`font-numeric tabular-nums text-lg ${metricClass[rowVariant]}`}>
            {player.winRate.toFixed(1)}%
          </span>
        </div>
        <div className="text-center">
          <p className={`font-numeric tabular-nums text-lg ${nameClass[rowVariant]}`}>
            {player.rankScore.toFixed(1)}
          </p>
        </div>
        {variant === 'squad' && squadPlayer && (
          <>
            <div className="flex justify-center">
              <LastGameDayNet value={squadPlayer.lastGameDayNet} variant={rowVariant} />
            </div>
            <div className="flex justify-center">
              <TrendIndicator rankChange={squadPlayer.rankChange} variant={rowVariant} />
            </div>
          </>
        )}
      </div>

      <div className="md:hidden relative z-10 space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0">
            <RankBadge rank={player.playerRank} variant={rowVariant} />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={`min-w-0 flex-1 truncate font-headline text-base font-bold leading-none ${nameLinkClass} ${nameClass[rowVariant]}`}
            >
              {capitalizeFirstLetter(player.name)}
            </span>
            {peakTenure}
            {variant === 'squad' && squadPlayer && (
              <div className="flex shrink-0">
                <TrendIndicator rankChange={squadPlayer.rankChange} variant={rowVariant} />
              </div>
            )}
          </div>
        </div>
        <div
          className={`flex items-center justify-between gap-2 ${variant === 'public' ? 'pr-1' : ''}`}
        >
          <div className="flex flex-col gap-0.5">
            <p className={`text-[10px] uppercase tracking-widest ${labelClass[rowVariant]}`}>
              Last 5
            </p>
            <FormBars results={player.lastFive} variant={rowVariant} align="start" />
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <p className={`text-[10px] uppercase tracking-widest ${labelClass[rowVariant]}`}>
              Win rate
            </p>
            <span className={`font-numeric tabular-nums text-sm ${metricClass[rowVariant]}`}>
              {player.winRate.toFixed(1)}%
            </span>
          </div>
          {variant === 'squad' && squadPlayer && (
            <div className="flex flex-col gap-0.5 text-right items-end">
              <p className={`text-[10px] uppercase tracking-widest ${labelClass[rowVariant]}`}>
                Last day
              </p>
              <LastGameDayNet value={squadPlayer.lastGameDayNet} variant={rowVariant} />
            </div>
          )}
          <div className="flex flex-col gap-0.5 text-right items-end">
            <p className={`text-[10px] uppercase tracking-widest ${labelClass[rowVariant]}`}>
              Points
            </p>
            <span className={`font-numeric tabular-nums text-sm ${nameClass[rowVariant]}`}>
              {player.rankScore.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    </>
  );

  if (isPublicBoard || !slug) {
    return (
      <div
        className={`relative overflow-hidden rounded-xl px-3 sm:px-8 py-2 md:py-4 ${rowClass}`}
        style={style}
      >
        {rowContent}
      </div>
    );
  }

  return (
    <Link
      href={encountersHref}
      className={`relative overflow-hidden group block cursor-pointer rounded-xl px-3 sm:px-8 py-2 md:py-4 ${rowClass} ${hoverBorder}`}
      style={style}
    >
      {rowContent}
    </Link>
  );
};

export default LeaderboardRow;
