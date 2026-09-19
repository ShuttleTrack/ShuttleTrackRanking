import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import type { PlayerRankingData } from '@/types/rankings';
import type { RowVariant } from './RankBadge';

interface TrendIndicatorProps {
  rankChange: PlayerRankingData['rankChange'];
  variant: RowVariant;
}

function trendColor(variant: RowVariant, direction: string): string {
  if (direction === 'up') {
    if (variant === 'gold') return 'text-yellow-950';
    if (variant === 'silver') return 'text-slate-800';
    if (variant === 'bronze') return 'text-orange-950';
    return 'text-primary';
  }
  if (direction === 'down') {
    if (variant === 'gold' || variant === 'bronze') return 'text-red-950';
    if (variant === 'silver') return 'text-red-800';
    return 'text-red-400';
  }
  if (variant === 'gold' || variant === 'silver' || variant === 'bronze') {
    return rankTextMuted(variant);
  }
  return 'text-on-surface-variant opacity-60';
}

function rankTextMuted(variant: RowVariant): string {
  if (variant === 'gold') return 'text-yellow-950';
  if (variant === 'silver') return 'text-slate-800';
  if (variant === 'bronze') return 'text-orange-950';
  return 'text-on-surface-variant';
}

const TrendIndicator = ({ rankChange, variant }: TrendIndicatorProps) => {
  const color = trendColor(variant, rankChange.direction);

  return (
    <div className={`flex items-center gap-1 font-headline font-bold text-sm ${color}`}>
      {rankChange.direction === 'up' ? (
        <ArrowTrendingUpIcon className="h-4 w-4" aria-hidden />
      ) : rankChange.direction === 'down' ? (
        <ArrowTrendingDownIcon className="h-4 w-4" aria-hidden />
      ) : (
        <MinusIcon className="h-4 w-4" aria-hidden />
      )}
      <span className="font-numeric tabular-nums">
        {rankChange.direction === 'up' && `+${rankChange.amount}`}
        {rankChange.direction === 'down' && `-${rankChange.amount}`}
        {rankChange.direction === 'none' && '0'}
      </span>
    </div>
  );
};

export default TrendIndicator;
