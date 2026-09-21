import type { CheckInVote } from '@/lib/check-in/types';

interface CheckInVoteButtonsProps {
  myVote: CheckInVote | null;
  onVote: (vote: CheckInVote) => void;
  disabled?: boolean;
}

const base =
  'flex min-h-12 flex-1 items-center justify-center rounded-xl font-headline text-base font-bold transition-all motion-safe:duration-200 motion-safe:active:scale-[0.97] disabled:opacity-50';

export function CheckInVoteButtons({ myVote, onVote, disabled }: CheckInVoteButtonsProps) {
  const inSelected = myVote === 'IN';
  const outSelected = myVote === 'OUT';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
      <button
        type="button"
        disabled={disabled}
        className={`${base} ${
          inSelected
            ? 'bg-primary text-black shadow-lg shadow-primary/20'
            : 'border border-white/10 bg-surface-container-high/50 text-on-surface hover:border-primary/40'
        }`}
        onClick={() => onVote('IN')}
        aria-pressed={inSelected}
      >
        I&apos;m in
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`${base} ${
          outSelected
            ? 'border border-red-500/40 bg-red-950/30 text-red-400'
            : 'border border-white/10 bg-surface-container-high/50 text-on-surface hover:border-red-500/30'
        }`}
        onClick={() => onVote('OUT')}
        aria-pressed={outSelected}
      >
        I&apos;m out
      </button>
    </div>
  );
}
