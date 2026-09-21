import { useState } from 'react';
import type { PlayerType } from '@prisma/client';
import { GameLoader } from '@/components/common/GameLoader';

interface AddPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; email: string; initialScore?: number; playerType: PlayerType }) => Promise<void>;
}

export const AddPlayerModal = ({ isOpen, onClose, onSubmit }: AddPlayerModalProps) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [playerType, setPlayerType] = useState<PlayerType>('FULLTIME');
  const [initialScore, setInitialScore] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isOpenSlot = playerType === 'OPEN_SLOT';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit({
        name,
        email,
        playerType,
        // Open-slot players (OPEN_SLOT_PLAYERS_PLAN.md) may be added without a score - they get
        // one later via the game-planner's bulk-assign step, the first time they're selected for
        // a game day.
        initialScore: isOpenSlot && initialScore <= 0 ? undefined : Number(initialScore),
      });
      setName('');
      setEmail('');
      setPlayerType('FULLTIME');
      setInitialScore(0);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Add New Player</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="alert alert-error text-sm">
              {error}
            </div>
          )}
          
          <div className="form-control">
            <label className="label">
              <span className="label-text">Name</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter player name"
              required
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Email</span>
            </label>
            <input
              type="email"
              className="input input-bordered w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter player email"
              required
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Type</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={playerType}
              onChange={(e) => setPlayerType(e.target.value as PlayerType)}
            >
              <option value="FULLTIME">Fulltime</option>
              <option value="OPEN_SLOT">Open slot</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Initial Score {isOpenSlot && '(optional)'}</span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              value={initialScore}
              onChange={(e) => setInitialScore(Number(e.target.value))}
              placeholder={isOpenSlot ? 'Assign later at game time' : 'Enter initial score'}
              min="0"
              max="2000"
              required={!isOpenSlot}
            />
          </div>

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <GameLoader size="sm" label="Adding player" caption={false} decorative inline className="text-black" />
                  Adding...
                </>
              ) : (
                'Add Player'
              )}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}; 