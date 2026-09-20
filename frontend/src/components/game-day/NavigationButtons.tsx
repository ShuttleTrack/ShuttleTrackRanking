interface NavigationButtonsProps {
  onBack: () => void;
  onContinue: () => void;
}

const outlineButtonClass =
  'flex w-full md:w-auto min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 px-6 py-3 font-medium text-on-surface transition-colors hover:border-primary/40 hover:bg-surface-container-high';

const primaryButtonClass =
  'flex w-full md:w-auto min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90';

export const NavigationButtons = ({ onBack, onContinue }: NavigationButtonsProps) => (
  <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-between">
    <button type="button" className={outlineButtonClass} onClick={onBack}>
      Back to Selection
    </button>
    <button type="button" className={primaryButtonClass} onClick={onContinue}>
      Continue to Score Keeper
    </button>
  </div>
);
