import useSWR from 'swr';
import { capitalizeFirstLetter } from '@/utils/string';

interface ReplacementRow {
  id: number;
  startDate: string;
  endDate: string;
  cancelledAt: string | null;
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

// OPEN_SLOT_PLAYERS_PLAN.md: read-only oversight for support/dispute cases. Creation and
// cancellation are self-service (the nominating player's own /user/replacement page) - an admin
// can see every window but has no cancel button here, so this deliberately renders no actions.
function statusOf(row: ReplacementRow, today: string): { label: string; className: string } {
  if (row.cancelledAt) return { label: 'Cancelled', className: 'badge-ghost' };
  if (toDateOnly(row.endDate) < today) return { label: 'Ended', className: 'badge-ghost' };
  if (toDateOnly(row.startDate) > today) return { label: 'Upcoming', className: 'badge-outline' };
  return { label: 'Active', className: 'badge-success' };
}

export const ReplacementOversight = ({ squadId }: { squadId: number }) => {
  const { data, error, isLoading } = useSWR<ReplacementRow[]>(
    squadId ? `/api/squads/${squadId}/replacements?scope=squad` : null,
    fetcher
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-base-100 rounded-lg shadow-lg border border-base-200">
      <div className="p-4 border-b border-base-200">
        <h2 className="text-lg font-semibold">Slot Replacements</h2>
        <p className="text-sm text-base-content/60">
          Fulltime players covering their slot with an open-slot player. Nominated and cancelled by
          the players themselves - read-only here.
        </p>
      </div>
      <div className="p-4">
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
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const status = statusOf(row, today);
                  return (
                    <tr key={row.id}>
                      <td className="font-medium">{capitalizeFirstLetter(row.fulltimePlayer.name)}</td>
                      <td>{capitalizeFirstLetter(row.replacementPlayer.name)}</td>
                      <td className="font-numeric tabular-nums">{toDateOnly(row.startDate)}</td>
                      <td className="font-numeric tabular-nums">{toDateOnly(row.endDate)}</td>
                      <td>
                        <span className={`badge ${status.className}`}>{status.label}</span>
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
