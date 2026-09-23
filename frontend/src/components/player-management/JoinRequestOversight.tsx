import { useState } from 'react';
import useSWR from 'swr';
import type { JoinRequestStatus, PlayerType } from '@prisma/client';
import { capitalizeFirstLetter } from '@/utils/string';
import { MAX_NAME_LENGTH } from '@/lib/joinRequests';

// Self-registration queue for one squad (SELF_REGISTRATION_PLAN.md). Modelled on
// ReplacementOversight: one table, a status badge per row, actions gated on the actionable
// state.
//
// Shows every status, not just PENDING - re-requesting after a rejection is allowed, so an
// admin needs to see that they already turned this person down rather than approving a name
// they declined last month.

interface JoinRequestRow {
  id: number;
  email: string;
  name: string;
  message: string | null;
  status: JoinRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByEmail: string | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load join requests');
  return res.json();
};

function statusOf(status: JoinRequestStatus): { label: string; className: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', className: 'badge-warning' };
    case 'APPROVED':
      return { label: 'Approved', className: 'badge-success' };
    case 'REJECTED':
      return { label: 'Rejected', className: 'badge-error' };
    default:
      return { label: 'Withdrawn', className: 'badge-ghost' };
  }
}

function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

interface ApproveModalProps {
  request: JoinRequestRow;
  squadId: number;
  fulltimeFull: boolean;
  maxPlayers: number | null;
  onClose: () => void;
  onDone: () => void;
}

const ApproveModal = ({
  request,
  squadId,
  fulltimeFull,
  maxPlayers,
  onClose,
  onDone,
}: ApproveModalProps) => {
  const [playerType, setPlayerType] = useState<PlayerType>('OPEN_SLOT');
  const [name, setName] = useState(request.name);
  const [initialScore, setInitialScore] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isFulltime = playerType === 'FULLTIME';
  // The cap applies to the full-time roster only, so open slot is never blocked by it.
  const blockedByCap = isFulltime && fulltimeFull;
  const scoreValid = !isFulltime || Number(initialScore) > 0;
  const canSubmit = name.trim().length > 0 && scoreValid && !blockedByCap && !submitting;

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/squads/${squadId}/join-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'approve',
          playerType,
          name: name.trim(),
          initialScore: initialScore.trim() === '' ? null : Number(initialScore),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? 'Failed to approve request');
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-join-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-base-200 bg-base-100 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="approve-join-title" className="mb-1 text-lg font-semibold">
          Approve {capitalizeFirstLetter(request.name)}
        </h3>
        <p className="mb-4 text-sm text-base-content/60">{request.email}</p>

        <label className="mb-1 block text-sm font-medium" htmlFor="approve-name">
          Name
        </label>
        <input
          id="approve-name"
          className="input input-bordered mb-4 w-full"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />

        <span className="mb-1 block text-sm font-medium">Player type</span>
        <div className="mb-4 flex gap-4">
          {(['OPEN_SLOT', 'FULLTIME'] as PlayerType[]).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                className="radio radio-sm"
                checked={playerType === type}
                onChange={() => setPlayerType(type)}
              />
              <span className="text-sm">{type === 'OPEN_SLOT' ? 'Open slot' : 'Full-time'}</span>
            </label>
          ))}
        </div>

        <label className="mb-1 block text-sm font-medium" htmlFor="approve-score">
          Starting score{' '}
          <span className="text-base-content/60">
            {isFulltime ? '(required)' : '(optional)'}
          </span>
        </label>
        <input
          id="approve-score"
          type="number"
          className="input input-bordered mb-1 w-full"
          value={initialScore}
          onChange={(e) => setInitialScore(e.target.value)}
        />
        <p className="mb-4 text-xs text-base-content/60">
          {isFulltime
            ? 'A full-time player needs a score before they can be ranked.'
            : "Leave blank to decide later — they'll show as “Needs a score” and the game planner will ask before their first game day."}
        </p>

        {blockedByCap && (
          <p className="mb-3 text-sm text-warning">
            This squad&apos;s full-time roster is full
            {maxPlayers !== null ? ` (${maxPlayers})` : ''}. You can still approve them as an
            open-slot player — raising the cap is a platform admin action.
          </p>
        )}
        {error && <p className="mb-3 text-sm text-error">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-success btn-sm" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface JoinRequestOversightProps {
  squadId: number;
  fulltimePlayerCount?: number;
  maxPlayers?: number | null;
  onApproved?: () => void;
}

export const JoinRequestOversight = ({
  squadId,
  fulltimePlayerCount,
  maxPlayers,
  onApproved,
}: JoinRequestOversightProps) => {
  const { data, error, isLoading, mutate } = useSWR<JoinRequestRow[]>(
    squadId ? `/api/squads/${squadId}/join-requests` : null,
    fetcher
  );
  const [approving, setApproving] = useState<JoinRequestRow | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  const fulltimeFull =
    maxPlayers !== null &&
    maxPlayers !== undefined &&
    fulltimePlayerCount !== undefined &&
    fulltimePlayerCount >= maxPlayers;

  const reject = async (id: number) => {
    setActionError('');
    setRejectingId(id);
    try {
      const res = await fetch(`/api/squads/${squadId}/join-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'reject' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to reject request');
      }
      await mutate();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to reject request');
    } finally {
      setRejectingId(null);
    }
  };

  const pendingCount = data?.filter((row) => row.status === 'PENDING').length ?? 0;

  return (
    <div className="rounded-lg border border-base-200 bg-base-100 shadow-lg">
      <div className="border-b border-base-200 p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Join requests
          {pendingCount > 0 && <span className="badge badge-warning">{pendingCount} pending</span>}
        </h2>
        <p className="text-sm text-base-content/60">
          People who asked to join this squad. Approving adds them to the roster — open slot by
          default, so they don&apos;t take a full-time place.
        </p>
      </div>

      <div className="p-4">
        {actionError && <p className="mb-3 text-sm text-error">{actionError}</p>}
        {isLoading ? (
          <p className="text-sm text-base-content/60">Loading…</p>
        ) : error ? (
          <p className="text-sm text-error">Couldn&apos;t load join requests.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-base-content/60">
            No one has asked to join yet. Requests only arrive if this squad is open for open-slot
            registration in Settings.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Message</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const status = statusOf(row.status);
                  const isPending = row.status === 'PENDING';
                  return (
                    <tr key={row.id}>
                      <td className="font-medium">{capitalizeFirstLetter(row.name)}</td>
                      <td className="text-sm">{row.email}</td>
                      <td className="max-w-xs text-sm text-base-content/70">{row.message ?? '-'}</td>
                      <td className="font-numeric tabular-nums text-sm">{toDateOnly(row.createdAt)}</td>
                      <td>
                        <span className={`badge ${status.className}`}>{status.label}</span>
                      </td>
                      <td>
                        {isPending && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-xs btn-success"
                              onClick={() => setApproving(row)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-error"
                              disabled={rejectingId === row.id}
                              onClick={() => reject(row.id)}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approving && (
        <ApproveModal
          request={approving}
          squadId={squadId}
          fulltimeFull={fulltimeFull}
          maxPlayers={maxPlayers ?? null}
          onClose={() => setApproving(null)}
          onDone={() => {
            void mutate();
            onApproved?.();
          }}
        />
      )}
    </div>
  );
};
