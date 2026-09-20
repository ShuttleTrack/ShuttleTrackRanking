import { useState, useEffect } from 'react';
import useSWR from 'swr';
import type { Player } from '@/types/player';
import { GameLoader } from '@/components/common/GameLoader';

interface EditPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (playerId: number, data: { name: string; email: string }) => Promise<void>;
  player: Player | null;
}

export const EditPlayerModal = ({ isOpen, onClose, onSubmit, player }: EditPlayerModalProps) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use SWR to manage player data
  const { mutate } = useSWR('/api/players');

  useEffect(() => {
    if (player) {
      setName(player.name);
      setEmail(player.email || '');
    }
  }, [player]);

  const handleActivate = async () => {
    if (!player) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/players/${player.id}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to activate player');
      }

      // Refresh the player list
      await mutate();

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate player');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !player) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(player.id, { name, email });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update player');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Edit Player</h3>
        
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
                  <GameLoader size="sm" label="Updating player" caption={false} decorative inline className="text-black" />
                  Updating...
                </>
              ) : (
                'Update Player'
              )}
            </button>
          </div>
        </form>
        <hr className="my-4"/>
        <h3 className="font-bold text-lg mb-4">Player Actions</h3>
        {!player.active && (
          <div className="mt-4">
            <button
              type="button"
              className="btn btn-neutral"
              onClick={handleActivate}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <GameLoader size="sm" label="Activating player" caption={false} decorative inline />
                  Activating...
                </>
              ) : (
                'Activate Player'
              )}
            </button>
          </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}; 