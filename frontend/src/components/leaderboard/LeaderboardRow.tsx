import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { PlayerRankingData } from '@/types/rankings';
import { capitalizeFirstLetter } from '@/utils/string';
import FormBars from './FormBars';
import RankBadge, { type RowVariant } from './RankBadge';
import TrendIndicator from './TrendIndicator';

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

const subtitleClass: Record<RowVariant, string> = {
  gold: 'text-yellow-900',
  silver: 'text-slate-700',
  bronze: 'text-orange-900',
  dark: 'text-secondary/70',
  default: 'text-on-surface-variant',
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

interface LeaderboardRowProps {
  player: PlayerRankingData;
}

const LeaderboardRow = ({ player }: LeaderboardRowProps) => {
  const variant = variantForRank(player.playerRank);
  const { style, className: rowClass } = rowStyles[variant];
  const hoverBorder =
    player.rankChange.direction === 'down' && variant === 'default'
      ? 'hover:border-red-500/20'
      : '';

  const subtitle = `Best rank #${player.highestRank}${player.timeInHighestRank ? ` · ${player.timeInHighestRank}` : ''}`;

  return (
    <div
      className={`relative overflow-hidden group rounded-xl px-3 sm:px-8 py-2 md:py-4 ${rowClass} ${hoverBorder}`}
      style={style}
    >
      {(variant === 'gold' || variant === 'dark') && (
        <div className="absolute right-0 top-0 h-full w-1/3 form-strip opacity-10 pointer-events-none" />
      )}

      {/* Desktop grid */}
      <div className="hidden md:grid grid-cols-12 items-center gap-2 relative z-10">
        <div className="col-span-1">
          <RankBadge rank={player.playerRank} variant={variant} />
        </div>
        <div className="col-span-4">
          <Link
            href={`/player/${player.id}/encounters`}
            className={`font-headline font-bold hover:underline ${nameClass[variant]}`}
          >
            {capitalizeFirstLetter(player.name)}
          </Link>
          <p className={`text-xs font-medium tracking-wide mt-0.5 ${subtitleClass[variant]}`}>
            {subtitle}
          </p>
        </div>
        <div className="col-span-2">
          <FormBars results={player.lastFive} variant={variant} />
        </div>
        <div className="col-span-2 text-center">
          <span className={`font-headline font-bold text-lg ${metricClass[variant]}`}>
            {player.winRate.toFixed(1)}%
          </span>
        </div>
        <div className="col-span-2 text-right">
          <p className={`font-headline font-bold text-lg ${nameClass[variant]}`}>
            {player.rankScore.toFixed(1)}
          </p>
        </div>
        <div className="col-span-1 flex justify-end">
          <TrendIndicator rankChange={player.rankChange} variant={variant} />
        </div>
      </div>

      {/* Mobile compact two-row layout */}
      <div className="md:hidden relative z-10 space-y-1">
        {/* Row 1: rank | name+subtitle | trend */}
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0">
            <RankBadge rank={player.playerRank} variant={variant} />
          </div>
          <div className="flex-1 min-w-0">
            <Link
              href={`/player/${player.id}/encounters`}
              className={`font-headline font-bold text-base hover:underline truncate block ${nameClass[variant]}`}
            >
              {capitalizeFirstLetter(player.name)}
            </Link>
            <p className={`text-xs font-medium mt-0.5 truncate ${subtitleClass[variant]}`}>{subtitle}</p>
          </div>
          <div className="flex-shrink-0">
            <TrendIndicator rankChange={player.rankChange} variant={variant} />
          </div>
        </div>
        {/* Row 2: last 5 | win rate | points */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <p
              className={`text-[10px] uppercase tracking-widest ${labelClass[variant]}`}
            >
              Last 5
            </p>
            <FormBars results={player.lastFive} variant={variant} align="start" />
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <p className={`text-[10px] uppercase tracking-widest ${labelClass[variant]}`}>
              Win rate
            </p>
            <span className={`font-headline font-bold text-sm ${metricClass[variant]}`}>
              {player.winRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <p className={`text-[10px] uppercase tracking-widest ${labelClass[variant]}`}>
              Points
            </p>
            <span className={`font-headline font-bold text-sm ${nameClass[variant]}`}>
              {player.rankScore.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaderboardRow;
