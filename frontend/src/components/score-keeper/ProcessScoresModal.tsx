import { GameLoader } from '@/components/common/GameLoader';

interface ProcessScoresModalProps {
  isOpen: boolean;
  isProcessing: boolean;
  error: string | null;
  success: boolean;
  onProcess: () => void;
  onRetry: () => void;
  onClose: () => void;
  title?: string;
  message?: string;
}

const outlineBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 px-6 py-3 font-medium text-on-surface transition-colors hover:border-primary/40';
const primaryBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90';
const modalBoxClass =
  'relative rounded-xl bg-surface-container-high border border-gray-600 p-6 w-full max-w-lg shadow-xl';
const modalActionsClass = 'flex flex-wrap justify-end gap-3 mt-6';

export const ProcessScoresModal = ({
  isOpen,
  isProcessing,
  error,
  success,
  onProcess,
  onRetry,
  onClose,
}: ProcessScoresModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className={modalBoxClass} role="dialog" aria-modal="true">
        <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">
          {error ? 'Processing Error' : success ? 'Processing Complete' : 'Results Submitted'}
        </h3>

        {error ? (
          <>
            <div className="rounded-xl border border-red-500/40 bg-red-950/20 px-4 py-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <div className={modalActionsClass}>
              <button type="button" className={outlineBtn} onClick={onClose}>
                Close
              </button>
              <button type="button" className={primaryBtn} onClick={onRetry}>
                Retry
              </button>
            </div>
          </>
        ) : success ? (
          <>
            <p className="text-on-surface-variant mb-4">
              All scores have been processed successfully.
            </p>
            <div className={modalActionsClass}>
              <button type="button" className={primaryBtn} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-on-surface-variant mb-4">
              All results have been submitted. Would you like to process the scores now?
            </p>
            {isProcessing ? (
              <div className="flex items-center justify-center gap-3 py-4" role="status" aria-label="Processing scores">
                <GameLoader size="md" label="Processing scores" caption={false} decorative inline />
                <span className="text-on-surface-variant">Processing scores...</span>
              </div>
            ) : (
              <div className={modalActionsClass}>
                <button type="button" className={outlineBtn} onClick={onClose}>
                  Close
                </button>
                <button type="button" className={primaryBtn} onClick={onProcess}>
                  Process Scores
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
