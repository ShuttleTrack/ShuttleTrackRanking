import { useState } from 'react';
import useSWR from 'swr';
import { capitalizeFirstLetter } from '@/utils/string';

interface ReplacementRow {
  id: number;
  startDate: string;
  endDate: string;
  cancelledAt: string | null;
  cancellationRequestedAt: string | null;
  cancellationRequestedEndDate: string | null;
  fulltimePlayer: { id: number; name: string };
  replacementPlayer: { id: number; name: string };
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load replacements');
  return res.json();
};

function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

// OPEN_SLOT_PLAYERS_PLAN.md: oversight for support/dispute cases. Creation is self-service (the
// nominating player's own /user/replacement page); ending one early is self-service to *request*
// but needs the admin approve/reject action here before it takes effect.
function statusOf(row: ReplacementRow, today: string): { label: string; className: string } {
  if (row.cancelledAt) return { label: 'Cancelled', className: 'badge-ghost' };
  if (row.cancellationRequestedAt) return { label: 'Cancellation requested', className: 'badge-warning' };
  if (toDateOnly(row.endDate) < today) return { label: 'Ended', className: 'badge-ghost' };
  if (toDateOnly(row.startDate) > today) return { label: 'Upcoming', className: 'badge-outline' };
  return { label: 'Active', className: 'badge-success' };
}

export const ReplacementOversight = ({ squadId }: { squadId: number }) => {
  const { data, error, isLoading, mutate } = useSWR<ReplacementRow[]>(
    squadId ? `/api/squads/${squadId}/replacements?scope=squad` : null,
    fetcher
  );
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [decisionError, setDecisionError] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const decide = async (id: number, decision: 'approve' | 'reject') => {
    setDecisionError('');
    setDecidingId(id);
    try {
      const res = await fetch(`/api/squads/${squadId}/replacements/${id}/cancellation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to decide cancellation request');
      }
      await mutate();
    } catch (e) {
      setDecisionError(e instanceof Error ? e.message : 'Failed to decide cancellation request');
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="bg-base-100 rounded-lg shadow-lg border border-base-200">
      <div className="p-4 border-b border-base-200">
        <h2 className="text-lg font-semibold">Slot Replacements</h2>
        <p className="text-sm text-base-content/60">
          Fulltime players covering their slot with an open-slot player. Nominated by the players
          themselves; ending one early needs your approval below.
        </p>
      </div>
      <div className="p-4">
        {decisionError && <p className="text-sm text-error mb-3">{decisionError}</p>}
        {isLoading ? (
          <p className="text-sm text-base-content/60">Loading…</p>
        ) : error ? (
          <p className="text-sm text-error">Couldn&apos;t load replacements.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-base-content/60">No replacements have been nominated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Slot owner</th>
                  <th>Covered by</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Requested change</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const status = statusOf(row, today);
                  const isPending = Boolean(row.cancellationRequestedAt) && !row.cancelledAt;
                  return (
                    <tr key={row.id}>
                      <td className="font-medium">{capitalizeFirstLetter(row.fulltimePlayer.name)}</td>
                      <td>{capitalizeFirstLetter(row.replacementPlayer.name)}</td>
                      <td className="font-numeric tabular-nums">{toDateOnly(row.startDate)}</td>
                      <td className="font-numeric tabular-nums">{toDateOnly(row.endDate)}</td>
                      <td>
                        <span className={`badge ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="text-sm">
                        {isPending
                          ? row.cancellationRequestedEndDate
                            ? `Shorten to ${toDateOnly(row.cancellationRequestedEndDate)}`
                            : 'Cancel'
                          : '-'}
                      </td>
                      <td>
                        {isPending && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-xs btn-success"
                              disabled={decidingId === row.id}
                              onClick={() => decide(row.id, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-error"
                              disabled={decidingId === row.id}
                              onClick={() => decide(row.id, 'reject')}
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
    </div>
  );
};
