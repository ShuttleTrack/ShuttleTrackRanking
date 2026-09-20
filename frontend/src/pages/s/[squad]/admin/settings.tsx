import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import type { DayOfWeek } from '@prisma/client';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadAdminOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';
import { useSquadSettings } from '@/hooks/useSquadSettings';

const cardClass = 'rounded-xl bg-surface-container/90 border border-gray-600 p-4 sm:p-6';
const sectionTitleClass = 'font-headline text-base sm:text-lg font-semibold text-on-surface mb-4';
const inputFieldClass =
  'w-full rounded-xl border border-gray-600 bg-surface-container px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';
const primaryBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const outlineBtn =
  'inline-flex min-h-[40px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 px-4 py-2 font-medium text-on-surface transition-colors hover:border-primary/40';

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function toDateInputValue(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

const SquadSettingsPage = () => {
  const { id: squadId } = useSquad();
  const { settings, isLoading, mutate } = useSquadSettings();

  const [isRecurring, setIsRecurring] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('WEDNESDAY');
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('20:00');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [skipDates, setSkipDates] = useState<string[]>([]);
  const [newSkipDate, setNewSkipDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setIsRecurring(settings.isRecurring);
    setDayOfWeek(settings.scheduleDayOfWeek ?? 'WEDNESDAY');
    setStartTime(settings.scheduleStartTime ?? '18:00');
    setEndTime(settings.scheduleEndTime ?? '20:00');
    setStartDate(toDateInputValue(settings.scheduleStartDate));
    setEndDate(toDateInputValue(settings.scheduleEndDate));
    setSkipDates(settings.scheduleSkipDates ?? []);
  }, [settings]);

  if (isLoading || !settings) {
    return <PageLoader variant="compact" label="Loading squad settings" />;
  }

  const addSkipDate = () => {
    if (!newSkipDate || skipDates.includes(newSkipDate)) return;
    setSkipDates([...skipDates, newSkipDate].sort());
    setNewSkipDate('');
  };

  const removeSkipDate = (date: string) => {
    setSkipDates(skipDates.filter((d) => d !== date));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/squads/${squadId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isRecurring,
          dayOfWeek: isRecurring ? dayOfWeek : null,
          startTime: isRecurring ? startTime : null,
          endTime: isRecurring ? endTime : null,
          startDate: isRecurring ? startDate : null,
          endDate: isRecurring ? (endDate || null) : null,
          skipDates: isRecurring ? skipDates : [],
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Failed to save schedule');
      }
      await mutate();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <section className="mb-6 sm:mb-8">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Squad Settings
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      </section>

      <div className={`${cardClass} mb-6`}>
        <h2 className={sectionTitleClass}>Status</h2>
        <p className="text-sm text-on-surface-variant">
          These are set by a platform admin, not here - shown for reference.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-label font-bold uppercase tracking-wide ${
              settings.enabled
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-red-950/30 text-red-400 border border-red-500/40'
            }`}
          >
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span>
            {settings.playerCount}
            {settings.maxPlayers !== null ? ` / ${settings.maxPlayers}` : ''} players
            {settings.maxPlayers === null && ' (no limit)'}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className={cardClass}>
        <h2 className={sectionTitleClass}>Play schedule</h2>

        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
          />
          <span className="text-sm font-medium text-on-surface">
            {isRecurring ? 'Recurring squad' : 'One-off squad'}
          </span>
        </label>

        {isRecurring && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">Day of week</label>
                <select
                  className={inputFieldClass}
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0) + d.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">Start time</label>
                <input
                  type="time"
                  className={inputFieldClass}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">End time</label>
                <input
                  type="time"
                  className={inputFieldClass}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">
                  Recurrence start date
                </label>
                <input
                  type="date"
                  className={inputFieldClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">
                  Recurrence end date (optional)
                </label>
                <input
                  type="date"
                  className={inputFieldClass}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="Ongoing"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">
                Skip days (holidays, etc.)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="date"
                  className={inputFieldClass}
                  value={newSkipDate}
                  onChange={(e) => setNewSkipDate(e.target.value)}
                />
                <button type="button" className={outlineBtn} onClick={addSkipDate}>
                  Add
                </button>
              </div>
              {skipDates.length > 0 && (
                <ul className="space-y-1.5">
                  {skipDates.map((date) => (
                    <li
                      key={date}
                      className="flex items-center justify-between rounded-lg border border-gray-600 bg-surface-container px-3 py-1.5 text-sm text-on-surface"
                    >
                      {date}
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => removeSkipDate(date)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
        {saved && !error && <p className="text-sm text-primary mt-4">Saved.</p>}

        <div className="mt-6">
          <button type="submit" className={primaryBtn} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SquadSettingsPage;

export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadAdminOrRedirect(context);
};
