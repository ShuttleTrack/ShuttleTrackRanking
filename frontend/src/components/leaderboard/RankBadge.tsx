import { TrophyIcon } from '@heroicons/react/24/solid';

export type RowVariant = 'gold' | 'silver' | 'bronze' | 'dark' | 'default';

interface RankBadgeProps {
  rank: number;
  variant: RowVariant;
}

const rankTextClass: Record<RowVariant, string> = {
  gold: 'text-yellow-950',
  silver: 'text-slate-800',
  bronze: 'text-orange-950',
  dark: 'text-secondary',
  default: 'text-on-surface-variant',
};

const RankBadge = ({ rank, variant }: RankBadgeProps) => {
  const padded = String(rank).padStart(2, '0');

  return (
    <div className="flex items-center gap-2">
      <span className={`font-headline font-extrabold text-2xl ${rankTextClass[variant]}`}>
        {padded}
      </span>
      {rank === 1 ? (
        <TrophyIcon className={`h-6 w-6 ${rankTextClass[variant]}`} aria-hidden />
      ) : rank >= 2 && rank <= 4 ? (
        <TrophyIcon
          className={`h-5 w-5 ${variant === 'dark' ? 'text-secondary/80' : rankTextClass[variant]} opacity-90`}
          aria-hidden
        />
      ) : null}
    </div>
  );
};

export default RankBadge;
