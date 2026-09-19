import type { RowVariant } from './RankBadge';

interface LastGameDayNetProps {
  value: number | null;
  variant: RowVariant;
  size?: 'sm' | 'md' | 'lg';
}

function netColor(variant: RowVariant, value: number): string {
  const positive = value > 0;
  const negative = value < 0;

  if (positive) {
    if (variant === 'gold') return 'text-yellow-950';
    if (variant === 'silver') return 'text-slate-800';
    if (variant === 'bronze') return 'text-orange-950';
    return 'text-primary';
  }
  if (negative) {
    if (variant === 'gold' || variant === 'bronze') return 'text-red-950';
    if (variant === 'silver') return 'text-red-800';
    return 'text-red-400';
  }
  if (variant === 'gold' || variant === 'silver' || variant === 'bronze') {
    if (variant === 'gold') return 'text-yellow-900/70';
    if (variant === 'silver') return 'text-slate-700/70';
    return 'text-orange-900/70';
  }
  return 'text-on-surface-variant opacity-60';
}

const LastGameDayNet = ({ value, variant, size = 'md' }: LastGameDayNetProps) => {
  const sizeClass =
    size === 'sm'
      ? 'text-xs font-numeric tabular-nums'
      : size === 'lg'
        ? 'font-numeric tabular-nums text-xl'
        : 'font-numeric tabular-nums text-sm';

  if (value === null) {
    return (
      <span className={`${sizeClass} ${netColor(variant, 0)}`} aria-label="No recent game day">
        —
      </span>
    );
  }

  const formatted = `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

  return (
    <span className={`${sizeClass} ${netColor(variant, value)}`} title="Net rank score on last played day">
      {formatted}
    </span>
  );
};

export default LastGameDayNet;
