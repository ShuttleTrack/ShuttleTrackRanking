interface ActionPanelProps {
  selectedCount: number;
  maxPlayers: number;
  isEditing: boolean;
  validationMessage: string;
  isValid: boolean;
  onCreateGame: () => void;
  isMobile?: boolean;
}

const primaryButtonClass =
  'flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';

export const ActionPanel = ({
  selectedCount,
  maxPlayers,
  isEditing,
  validationMessage,
  isValid,
  onCreateGame,
  isMobile = false,
}: ActionPanelProps) => {
  const ctaLabel = isEditing ? 'Update Game Day' : 'Create Game Day';

  if (isMobile) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/5 bg-background p-4 md:hidden"
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-headline font-medium text-on-surface">
              Selected:{' '}
              <span className="font-numeric tabular-nums">
                {selectedCount}/{maxPlayers}
              </span>
            </div>
            {selectedCount > 0 && !isValid && (
              <div className="text-sm text-red-400 text-right">{validationMessage}</div>
            )}
          </div>
          <button
            type="button"
            className={`${primaryButtonClass} w-full`}
            disabled={!isValid}
            title={validationMessage}
            onClick={onCreateGame}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden md:block mt-6">
      <div className="flex justify-between items-center gap-4">
        <div className="font-headline text-lg font-semibold text-on-surface">
          Selected Players:{' '}
          <span className="font-numeric tabular-nums">
            {selectedCount}/{maxPlayers}
          </span>
        </div>
        <button
          type="button"
          className={`${primaryButtonClass} w-auto`}
          disabled={!isValid}
          title={validationMessage}
          onClick={onCreateGame}
        >
          {ctaLabel}
        </button>
      </div>
      {selectedCount > 0 && !isValid && (
        <p className="text-sm text-red-400 mt-2">{validationMessage}</p>
      )}
    </div>
  );
};
