import type { CheckInVote } from '@/lib/check-in/types';

interface CheckInVoteButtonsProps {
  myVote: CheckInVote | null;
  onVote: (vote: CheckInVote) => void;
  disabled?: boolean;
  // Per-button, from the server's own rule table (GameDayView.actions) - e.g. "I'm in" after the
  // deadline for someone who did not vote in.
  inDisabled?: boolean;
  outDisabled?: boolean;
  // A direct open-slot claimer gets "I'm in" only (Decision 7).
  hideOut?: boolean;
}

export const checkInButtonBase =
  'flex min-h-12 flex-1 items-center justify-center rounded-xl font-headline text-base font-bold transition-all motion-safe:duration-200 motion-safe:active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed';

export const checkInButtonIdle =
  'border border-white/20 bg-surface-container-high/50 text-on-surface hover:border-primary/40';
export const checkInButtonPrimary = 'bg-primary text-black';
export const checkInButtonOut =
  'bg-red-600 text-white hover:bg-red-500 border border-red-500/30';

const checkInButtonIn = `${checkInButtonPrimary} hover:brightness-110`;
const checkInButtonInSelected = 'ring-2 ring-inset ring-black/20';
const checkInButtonOutSelected = 'ring-2 ring-inset ring-white/25 bg-red-500';

export function CheckInVoteButtons({
  myVote,
  onVote,
  disabled,
  inDisabled,
  outDisabled,
  hideOut,
}: CheckInVoteButtonsProps) {
  const inSelected = myVote === 'IN';
  const outSelected = myVote === 'OUT';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
      <button
        type="button"
        disabled={disabled || inDisabled}
        className={`${checkInButtonBase} ${checkInButtonIn} ${inSelected ? checkInButtonInSelected : ''}`}
        onClick={() => onVote('IN')}
        aria-pressed={inSelected}
      >
        I&apos;m in
      </button>
      {hideOut ? null : (
        <button
          type="button"
          disabled={disabled || outDisabled}
          className={`${checkInButtonBase} ${checkInButtonOut} ${outSelected ? checkInButtonOutSelected : ''}`}
          onClick={() => onVote('OUT')}
          aria-pressed={outSelected}
        >
          I&apos;m out
        </button>
      )}
    </div>
  );
}
