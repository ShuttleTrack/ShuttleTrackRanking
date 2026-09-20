import { useState } from 'react';
import { GameLoader } from '@/components/common/GameLoader';

interface AddPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; email: string; initialScore: number }) => Promise<void>;
}

export const AddPlayerModal = ({ isOpen, onClose, onSubmit }: AddPlayerModalProps) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [initialScore, setInitialScore] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit({ 
        name, 
        email, 
        initialScore: Number(initialScore)
      });
      setName('');
      setEmail('');
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
              <span className="label-text">Initial Score</span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              value={initialScore}
              onChange={(e) => setInitialScore(Number(e.target.value))}
              placeholder="Enter initial score"
              min="0"
              max="2000"
              required
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