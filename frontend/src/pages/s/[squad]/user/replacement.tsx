import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import useSWR from 'swr';
import { PlayerType } from '@prisma/client';
import { usePlayers } from '@/hooks/usePlayers';
import { useRequireUser } from '@/hooks/useRequireUser';
import { capitalizeFirstLetter } from '@/utils/string';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadUserOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';

interface OpenSlotOption {
  id: number;
  name: string;
  email: string;
}

interface ReplacementRow {
  id: number;
  startDate: string;
  endDate: string;
  cancelledAt: string | null;
  replacementPlayer: { id: number; name: string };
}

interface ReplacementPageProps {
  squad: SquadSummary;
  playerId: number | null;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const inputClass =
  'w-full rounded-xl border border-gray-600 bg-surface-container px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';
const primaryBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const ghostBtn =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm text-on-surface transition-colors hover:border-primary/40';

const ReplacementPage = ({ playerId }: ReplacementPageProps) => {
  const { id: squadId } = useSquad();
  const { status } = useRequireUser(playerId !== null);
  const { players, isLoading: playersLoading } = usePlayers();
  const currentPlayer = players.find((p) => p.id === playerId);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OpenSlotOption | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data: searchResults } = useSWR<OpenSlotOption[]>(
    query.trim().length > 0 ? `/api/squads/${squadId}/players/open-slot?query=${encodeURIComponent(query)}` : null,
    fetcher
  );

  const { data: myReplacements, mutate: refreshReplacements } = useSWR<ReplacementRow[]>(
    squadId ? `/api/squads/${squadId}/replacements` : null,
    fetcher
  );

  useEffect(() => {
    if (selected) setQuery(selected.name);
  }, [selected]);

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    if (!selected) {
      setError('Search for and select an open-slot player to nominate');
      return;
    }
    if (!startDate || !endDate) {
      setError('Start and end dates are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/squads/${squadId}/replacements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replacementPlayerId: selected.id, startDate, endDate }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message ?? 'Failed to create replacement');
      }
      setSuccess(`${capitalizeFirstLetter(selected.name)} will cover your slot from ${startDate} to ${endDate}.`);
      setSelected(null);
      setQuery('');
      setStartDate('');
      setEndDate('');
      await refreshReplacements();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create replacement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      const res = await fetch(`/api/squads/${squadId}/replacements/${id}`, { method: 'PATCH' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to cancel');
      }
      await refreshReplacements();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel replacement');
    }
  };

  if (status === 'loading' || playersLoading) {
    return <PageLoader variant="tall" label="Loading" />;
  }

  if (currentPlayer && currentPlayer.playerType !== PlayerType.FULLTIME) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
        <p className="text-on-surface-variant">
          Only fulltime players have a slot to give away - open-slot players don&apos;t need a replacement.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <header className="mb-6">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Nominate a replacement
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
        <p className="text-on-surface-variant mt-2">
          Give your slot to an open-slot player for a date range - at least 3 playing days. No admin approval
          needed.
        </p>
      </header>

      <section className="rounded-xl border border-gray-600 bg-surface-container p-4 sm:p-6 space-y-4">
        <div>
          <label className="block text-sm text-on-surface-variant mb-1">Open-slot player</label>
          <input
            type="text"
            className={inputClass}
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
          />
          {!selected && query.trim().length > 0 && searchResults && (
            <div className="mt-2 rounded-xl border border-gray-600 bg-surface-container-high divide-y divide-gray-600 overflow-hidden">
              {searchResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-on-surface-variant">No open-slot players match.</p>
              ) : (
                searchResults.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-surface-container transition-colors"
                    onClick={() => setSelected(option)}
                  >
                    <div className="font-medium text-on-surface">{capitalizeFirstLetter(option.name)}</div>
                    <div className="text-xs text-on-surface-variant">{option.email}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-on-surface-variant mb-1">Start date</label>
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-on-surface-variant mb-1">End date</label>
            <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-error text-sm">{error}</p>}
        {success && <p className="text-success text-sm">{success}</p>}

        <button type="button" className={primaryBtn} onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Nominate replacement'}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="font-headline text-sm font-bold uppercase tracking-wide text-on-surface-variant mb-3">
          Your replacements
        </h2>
        {!myReplacements || myReplacements.length === 0 ? (
          <p className="text-on-surface-variant text-sm">You haven&apos;t nominated any replacements yet.</p>
        ) : (
          <div className="space-y-2">
            {myReplacements.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-600 bg-surface-container px-4 py-3"
              >
                <div>
                  <div className="font-medium text-on-surface">{capitalizeFirstLetter(r.replacementPlayer.name)}</div>
                  <div className="text-xs text-on-surface-variant">
                    {r.startDate.slice(0, 10)} to {r.endDate.slice(0, 10)}
                    {r.cancelledAt ? ' - cancelled' : ''}
                  </div>
                </div>
                {!r.cancelledAt && (
                  <button type="button" className={ghostBtn} onClick={() => handleCancel(r.id)}>
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ReplacementPage;

export const getServerSideProps: GetServerSideProps<ReplacementPageProps> = async (context) => {
  return resolveSquadUserOrRedirect(context);
};
