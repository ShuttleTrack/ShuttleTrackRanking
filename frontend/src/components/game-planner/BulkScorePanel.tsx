import { useState } from 'react';
import type { GamePlannerPlayer } from '@/hooks/useGamePlayers';
import { capitalizeFirstLetter } from '@/utils/string';

interface BulkScorePanelProps {
  players: GamePlannerPlayer[];
  suggestedScore: number;
  onCancel: () => void;
  onSubmit: (assignments: { playerId: number; rankScore: number }[]) => Promise<void>;
}

// OPEN_SLOT_PLAYERS_PLAN.md "Bulk initial rank-score assignment": a single action covering every
// selected-but-scoreless player, not a per-player prompt chain. The server-side game-create gate
// is the real enforcement point - this panel is just the friendly path to satisfying it.
export const BulkScorePanel = ({ players, suggestedScore, onCancel, onSubmit }: BulkScorePanelProps) => {
  const [scores, setScores] = useState<Record<number, string>>(() =>
    Object.fromEntries(players.map((p) => [p.id, String(suggestedScore)]))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const assignments: { playerId: number; rankScore: number }[] = [];
    for (const player of players) {
      const value = Number(scores[player.id]);
      if (!Number.isFinite(value) || value <= 0) {
        setError(`Enter a valid score (greater than 0) for ${capitalizeFirstLetter(player.name)}`);
        return;
      }
      assignments.push({ playerId: player.id, rankScore: value });
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit(assignments);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign scores');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-600 bg-surface-container p-4 sm:p-6">
        <h2 className="font-headline text-lg font-bold text-on-surface">Assign starting scores</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          These players don&apos;t have a rank score yet, so they can&apos;t be placed into a game day
          until they get one.
        </p>

        <div className="space-y-3 max-h-64 overflow-y-auto">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between gap-3">
              <span className="text-on-surface truncate">{capitalizeFirstLetter(player.name)}</span>
              <input
                type="number"
                min={1}
                className="input input-bordered input-sm w-28"
                value={scores[player.id] ?? ''}
                onChange={(e) => setScores((s) => ({ ...s, [player.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        {error && <p className="text-error text-sm mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Assigning...' : 'Assign & continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
