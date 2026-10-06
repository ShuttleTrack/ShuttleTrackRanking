import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { PlayerType } from '@prisma/client';
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH } from '@/lib/joinRequests';

// Shared by the /squads/browse cards and the squad board's own "Request to join" CTA
// (SELF_REGISTRATION_PLAN.md).
//
// Posts { name, message, playerType } only - deliberately no email field. The requester's identity comes
// from the session server-side; a body-supplied email would let anyone file a request as
// someone else now that sign-in is open to every verified Google account.

const fieldClass =
  'w-full rounded-xl border border-gray-600 bg-surface-container px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';
const outlineBtn =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-medium text-on-surface transition-colors hover:border-primary/40 disabled:opacity-50';
const primaryBtn =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';

// Open slot first and the default: it's the common self-registration case, and full-time places
// are capped (Squad.maxPlayers) so the admin may not be able to grant one anyway.
const PLAYER_TYPE_OPTIONS: { value: PlayerType; label: string; hint: string }[] = [
  { value: 'OPEN_SLOT', label: 'Open slot', hint: 'Play when a spot opens up' },
  { value: 'FULLTIME', label: 'Full-time', hint: 'A regular place every game day' },
];

interface JoinRequestModalProps {
  squadId: number;
  squadName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function JoinRequestModal({ squadId, squadName, onClose, onSubmitted }: JoinRequestModalProps) {
  const { data: session } = useSession();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [playerType, setPlayerType] = useState<PlayerType>('OPEN_SLOT');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Prefill from the Google profile, truncated to what Player.name can hold - a display name
  // longer than that is common, and the server rejects it rather than truncating silently.
  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name.trim().slice(0, MAX_NAME_LENGTH));
    }
  }, [session?.user?.name]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH && !submitting;

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/squads/${squadId}/join-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, message: message.trim() || null, playerType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to send request');
      }
      onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-request-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-surface-container p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="join-request-title" className="mb-1 font-headline text-lg font-semibold text-on-surface">
          Request to join {squadName}
        </h3>
        <p className="mb-4 text-sm text-on-surface-variant">
          Subject to squad admin approval. The admin may offer you the other type, e.g. an open
          slot if the full-time roster is full.
        </p>

        <span className="mb-1 block text-sm font-medium text-on-surface">Join as</span>
        <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Join as">
          {PLAYER_TYPE_OPTIONS.map((option) => {
            const selected = playerType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-600 hover:border-primary/40'
                }`}
                onClick={() => setPlayerType(option.value)}
              >
                <span className="block text-sm font-semibold text-on-surface">{option.label}</span>
                <span className="block text-xs text-on-surface-variant">{option.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="mb-1 flex items-baseline justify-between">
          <label className="block text-sm font-medium text-on-surface" htmlFor="join-name">
            Your name
          </label>
          <span className="text-xs text-on-surface-variant">
            {trimmedName.length}/{MAX_NAME_LENGTH}
          </span>
        </div>
        <input
          id="join-name"
          className={`${fieldClass} mb-4`}
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="mb-1 flex items-baseline justify-between">
          <label className="block text-sm font-medium text-on-surface" htmlFor="join-message">
            Message <span className="text-on-surface-variant">(optional)</span>
          </label>
          <span className="text-xs text-on-surface-variant">
            {message.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
        <textarea
          id="join-message"
          className={`${fieldClass} mb-4 resize-none`}
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          value={message}
          placeholder="Level, when you can play, anything else."
          onChange={(e) => setMessage(e.target.value)}
        />

        <p className="mb-4 text-xs text-on-surface-variant">
          Applying as {session?.user?.email}
        </p>

        {error && <p className="mb-3 text-sm text-error">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className={outlineBtn} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
}
