import type { RowVariant } from './RankBadge';

export interface PeakTenureInput {
  playerRank: number;
  highestRank: number;
  timeInHighestRank: string;
}

export function parsePeakTenureDays(timeInHighestRank: string): number | null {
  const trimmed = timeInHighestRank.trim();
  if (!trimmed) return null;
  const match = /^(\d+)/.exec(trimmed);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

export function peakTenureCopy({
  playerRank,
  highestRank,
  timeInHighestRank,
}: PeakTenureInput): { label: string; ariaLabel: string } {
  const days = parsePeakTenureDays(timeInHighestRank);
  const atPeak = playerRank === highestRank;

  if (atPeak) {
    if (days === null) {
      return { label: 'At peak', ariaLabel: 'Currently at personal best rank' };
    }
    if (days === 0) {
      return { label: 'New peak', ariaLabel: 'New personal best rank' };
    }
    const dayWord = days === 1 ? 'day' : 'days';
    return {
      label: `${days}d at peak`,
      ariaLabel: `At peak for ${days} ${dayWord}`,
    };
  }

  if (days === null) {
    return {
      label: `Peak #${highestRank}`,
      ariaLabel: `Best rank ${highestRank}`,
    };
  }
  const dayWord = days === 1 ? 'day' : 'days';
  return {
    label: `Peak #${highestRank} · ${days}d`,
    ariaLabel: `Best rank ${highestRank}, held for ${days} ${dayWord}`,
  };
}

const chipClass: Record<RowVariant, string> = {
  gold: 'bg-yellow-950/10 text-yellow-900',
  silver: 'bg-slate-900/10 text-slate-700',
  bronze: 'bg-orange-950/10 text-orange-900',
  dark: 'bg-white/10 text-on-surface-variant',
  default: 'bg-white/10 text-on-surface-variant',
};

interface PeakTenureProps extends PeakTenureInput {
  variant: RowVariant;
}

const PeakTenure = ({ variant, playerRank, highestRank, timeInHighestRank }: PeakTenureProps) => {
  const { label, ariaLabel } = peakTenureCopy({
    playerRank,
    highestRank,
    timeInHighestRank,
  });

  return (
    <span
      className={`inline-flex w-fit max-w-full shrink-0 items-center rounded-full px-2 py-px font-label text-[10px] font-bold uppercase leading-none tracking-widest ${chipClass[variant]}`}
      aria-label={ariaLabel}
    >
      <span className="truncate font-numeric tabular-nums leading-none">{label}</span>
    </span>
  );
};

export default PeakTenure;
