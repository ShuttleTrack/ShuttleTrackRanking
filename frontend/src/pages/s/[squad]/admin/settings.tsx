import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import type { DayOfWeek } from '@/lib/squadSchedule';
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
const readOnlyChipClass =
  'inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant';
const statusFactTileClass =
  'rounded-lg border border-white/5 bg-surface-container-high/40 px-2.5 py-2 sm:px-4 sm:py-3';
const statusFactLabelClass =
  'font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60';
const modalBoxClass =
  'relative w-full max-w-lg rounded-xl border border-gray-600 bg-surface-container-high p-6 shadow-xl';
const modalActionsClass = 'mt-6 flex flex-wrap justify-end gap-3';
const scheduleFieldLabelClass =
  'mb-1 block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant/60';

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function visibilityConfirmCopy(pendingPublic: boolean) {
  if (pendingPublic) {
    return {
      title: 'Make squad public',
      message:
        'This squad will appear on the site-root leaderboard. Players in more than one public squad have their points added together there.',
      confirmLabel: 'Make public',
    };
  }
  return {
    title: 'Make squad private',
    message:
      'This squad will stay reachable by link but will no longer appear on the site-root leaderboard.',
    confirmLabel: 'Make private',
  };
}

function toDateInputValue(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function formatScheduleDateDisplay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

const SquadSettingsPage = () => {
  const { id: squadId } = useSquad();
  const { settings, isLoading, mutate } = useSquadSettings();

  const [isPublic, setIsPublic] = useState(true);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [isSavingVisibility, setIsSavingVisibility] = useState(false);
  const [pendingPublic, setPendingPublic] = useState<boolean | null>(null);

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
    setIsPublic(settings.isPublic);
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

  const closeVisibilityModal = () => {
    if (isSavingVisibility) return;
    setPendingPublic(null);
    setVisibilityError(null);
  };

  const handleConfirmVisibility = async () => {
    if (pendingPublic === null) return;
    setIsSavingVisibility(true);
    setVisibilityError(null);
    try {
      const response = await fetch(`/api/squads/${squadId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: pendingPublic }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Failed to save visibility');
      }
      await mutate();
      setPendingPublic(null);
    } catch (err) {
      setVisibilityError(err instanceof Error ? err.message : 'Failed to save visibility');
    } finally {
      setIsSavingVisibility(false);
    }
  };

  const visibilityToggleDisabled = pendingPublic !== null || isSavingVisibility;

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
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="font-headline text-base sm:text-lg font-semibold text-on-surface">Status</h2>
          <span className={readOnlyChipClass}>
            <LockClosedIcon className="h-3 w-3 shrink-0" aria-hidden />
            Read only
          </span>
        </div>
        <p className="mb-2 text-xs text-on-surface-variant sm:mb-3 sm:text-sm">
          Managed by platform admin
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className={statusFactTileClass}>
            <p className="text-xs leading-snug sm:text-sm">
              <span className={statusFactLabelClass}>Squad </span>
              <span
                className={`font-medium ${settings.enabled ? 'text-primary' : 'text-red-400'}`}
              >
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </p>
          </div>
          <div className={statusFactTileClass}>
            <p className="font-numeric text-xs leading-snug tabular-nums sm:text-sm">
              <span className={statusFactLabelClass}>Roster </span>
              <span className="font-medium text-on-surface">
                {settings.maxPlayers !== null
                  ? `${settings.playerCount}/${settings.maxPlayers}`
                  : `${settings.playerCount} · ∞`}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className={sectionTitleClass}>Visibility</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Public squads appear on the site-root leaderboard. If someone plays in more than one
          public squad, their points are added together there. Private squads stay reachable by
          link and are not included in that sum.
        </p>
        <label
          className={`flex items-center gap-3 ${visibilityToggleDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={isPublic}
            disabled={visibilityToggleDisabled}
            onChange={() => {
              setVisibilityError(null);
              setPendingPublic(!isPublic);
            }}
          />
          <span className="text-sm font-medium text-on-surface">
            {isPublic ? 'Public' : 'Private'}
          </span>
        </label>
      </div>

      {pendingPublic !== null && (() => {
        const { title, message, confirmLabel } = visibilityConfirmCopy(pendingPublic);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="visibility-confirm-title"
            onClick={closeVisibilityModal}
          >
            <div className={modalBoxClass} onClick={(e) => e.stopPropagation()}>
              <h3
                id="visibility-confirm-title"
                className="mb-4 font-headline text-lg font-semibold text-on-surface"
              >
                {title}
              </h3>
              <p className="text-sm text-on-surface-variant">{message}</p>
              {visibilityError && (
                <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/20 px-4 py-3">
                  <p className="text-sm text-red-400">{visibilityError}</p>
                </div>
              )}
              <div className={modalActionsClass}>
                <button
                  type="button"
                  className={outlineBtn}
                  disabled={isSavingVisibility}
                  onClick={closeVisibilityModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={isSavingVisibility}
                  onClick={() => void handleConfirmVisibility()}
                >
                  {isSavingVisibility ? 'Saving…' : confirmLabel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <form onSubmit={handleSave} className={cardClass}>
        <h2 className={sectionTitleClass}>Play schedule</h2>

        <label className="mb-3 flex cursor-pointer items-center gap-3">
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

        {!isRecurring && (
          <p className="mb-3 text-sm text-on-surface-variant">No weekly play day.</p>
        )}

        {isRecurring && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={scheduleFieldLabelClass}>Day</label>
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
                <label className={scheduleFieldLabelClass}>Start</label>
                <input
                  type="time"
                  className={inputFieldClass}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={scheduleFieldLabelClass}>End</label>
                <input
                  type="time"
                  className={inputFieldClass}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={scheduleFieldLabelClass}>Starts</label>
                <input
                  type="date"
                  className={inputFieldClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={scheduleFieldLabelClass}>Ends (optional)</label>
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
              <label className={scheduleFieldLabelClass}>Skip days</label>
              <div className="mb-2 flex gap-2">
                <input
                  type="date"
                  className={inputFieldClass}
                  value={newSkipDate}
                  onChange={(e) => setNewSkipDate(e.target.value)}
                />
                <button type="button" className={`${outlineBtn} shrink-0`} onClick={addSkipDate}>
                  Add
                </button>
              </div>
              {skipDates.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {skipDates.map((date) => (
                    <li key={date}>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-0.5 pl-2.5 pr-1 font-numeric text-xs tabular-nums text-on-surface">
                        {formatScheduleDateDisplay(date)}
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/10 hover:text-red-400"
                          onClick={() => removeSkipDate(date)}
                          aria-label={`Remove skip day ${formatScheduleDateDisplay(date)}`}
                        >
                          ×
                        </button>
                      </span>
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
