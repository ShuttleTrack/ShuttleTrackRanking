import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH } from '@/lib/joinRequests';

// Shared by the /squads/browse cards and the squad board's own "Request to join" CTA
// (SELF_REGISTRATION_PLAN.md).
//
// Posts { name, message } only - deliberately no email field. The requester's identity comes
// from the session server-side; a body-supplied email would let anyone file a request as
// someone else now that sign-in is open to every verified Google account.

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
        body: JSON.stringify({ name: trimmedName, message: message.trim() || null }),
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
          A squad admin reviews this. You&apos;ll be added as an open-slot player unless they
          decide otherwise.
        </p>

        <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="join-name">
          Your name
        </label>
        <input
          id="join-name"
          className="input input-bordered mb-1 w-full"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="mb-3 text-xs text-on-surface-variant">
          {trimmedName.length}/{MAX_NAME_LENGTH} — how you&apos;ll appear on the squad&apos;s board.
        </p>

        <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="join-message">
          Message <span className="text-on-surface-variant">(optional)</span>
        </label>
        <textarea
          id="join-message"
          className="textarea textarea-bordered mb-1 w-full"
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          value={message}
          placeholder="Anything the admin should know — how you heard about the squad, your level, when you can play."
          onChange={(e) => setMessage(e.target.value)}
        />
        <p className="mb-4 text-xs text-on-surface-variant">
          Signing in as {session?.user?.email}
        </p>

        {error && <p className="mb-3 text-sm text-error">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
}
