import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import type { DayOfWeek } from '@/lib/squadSchedule';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadAdminOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';
import { useSquadSettings } from '@/hooks/useSquadSettings';
import { DEFAULT_TIMEZONE } from '@/lib/gameDay/clock';
import { TimezonePicker } from '@/components/common/TimezonePicker';

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
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [newSkipDate, setNewSkipDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const [openSlotAbsenteeGraceDays, setOpenSlotAbsenteeGraceDays] = useState(3);
  const [openSlotVisibilityGameDays, setOpenSlotVisibilityGameDays] = useState(10);
  const [openForOpenSlot, setOpenForOpenSlot] = useState(false);
  const [openSlotError, setOpenSlotError] = useState<string | null>(null);
  const [isSavingOpenSlot, setIsSavingOpenSlot] = useState(false);
  const [openSlotSaved, setOpenSlotSaved] = useState(false);

  const [checkInEnabled, setCheckInEnabled] = useState(false);
  const [voteOpensDaysBefore, setVoteOpensDaysBefore] = useState(2);
  const [minPlayersForOpenSlot, setMinPlayersForOpenSlot] = useState('');
  const [telegramMainChatId, setTelegramMainChatId] = useState('');
  const [telegramOpenSlotChatId, setTelegramOpenSlotChatId] = useState('');
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [isSavingCheckIn, setIsSavingCheckIn] = useState(false);
  const [checkInSaved, setCheckInSaved] = useState<string | null>(null);

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
    setTimezone(settings.scheduleTimezone ?? DEFAULT_TIMEZONE);
    setCheckInEnabled(settings.gameDayOpsEnabled);
    setVoteOpensDaysBefore(settings.gameDayVoteOpensDaysBefore);
    setMinPlayersForOpenSlot(settings.gameDayMinPlayersForOpenSlot?.toString() ?? '');
    setTelegramMainChatId(settings.gameDayTelegramMainChatId ?? '');
    setTelegramOpenSlotChatId(settings.gameDayTelegramOpenSlotChatId ?? '');
    setOpenSlotAbsenteeGraceDays(settings.openSlotAbsenteeGraceDays);
    setOpenSlotVisibilityGameDays(settings.openSlotVisibilityGameDays);
    setOpenForOpenSlot(settings.openForOpenSlot);
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

  const handleSaveOpenSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingOpenSlot(true);
    setOpenSlotError(null);
    setOpenSlotSaved(false);
    try {
      const response = await fetch(`/api/squads/${squadId}/open-slot-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openSlotAbsenteeGraceDays, openSlotVisibilityGameDays, openForOpenSlot }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Failed to save open-slot settings');
      }
      await mutate();
      setOpenSlotSaved(true);
    } catch (err) {
      setOpenSlotError(err instanceof Error ? err.message : 'Failed to save open-slot settings');
    } finally {
      setIsSavingOpenSlot(false);
    }
  };

  const handleSaveCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCheckIn(true);
    setCheckInError(null);
    setCheckInSaved(null);
    try {
      const response = await fetch(`/api/squads/${squadId}/game-day-ops`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: checkInEnabled,
          voteOpensDaysBefore,
          minPlayersForOpenSlot: minPlayersForOpenSlot.trim() === '' ? null : Number(minPlayersForOpenSlot),
          telegramMainChatId,
          telegramOpenSlotChatId,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message || 'Failed to save check-in settings');
      }
      await mutate();
      setCheckInSaved(
        body.cancelledGameDays > 0 ? `Saved. ${body.cancelledGameDays} open game day(s) were cancelled.` : 'Saved.'
      );
    } catch (err) {
      setCheckInError(err instanceof Error ? err.message : 'Failed to save check-in settings');
    } finally {
      setIsSavingCheckIn(false);
    }
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
          timezone: isRecurring ? timezone : null,
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
              {/*
                maxPlayers caps the FULL-TIME roster only, so the cap is shown against the
                full-time count - rendering the whole roster against it would misreport how full
                the squad is, since open-slot players consume no slot.
              */}
              <span className={statusFactLabelClass}>Full-time </span>
              <span className="font-medium text-on-surface">
                {settings.maxPlayers !== null
                  ? `${settings.fulltimePlayerCount}/${settings.maxPlayers}`
                  : `${settings.fulltimePlayerCount} · ∞`}
              </span>
              <span className="block text-[10px] text-on-surface-variant">
                {settings.playerCount} on the roster in total
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

      <form onSubmit={handleSaveOpenSlot} className={`${cardClass} mb-6`}>
        <h2 className={sectionTitleClass}>Open-slot players</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Open-slot players fill a vacant spot rather than holding a permanent one, so their
          absentee treatment and leaderboard visibility taper off differently from a fulltime
          player&apos;s - both counted in playing days since their last game.
        </p>

        {/*
          Unlike the Visibility toggle above, this form has an explicit Save button, so the
          change is already deliberate - the explanation lives inline rather than in a
          confirmation modal. What it must not do is stay vague: turning this on lists the squad
          publicly and starts a request queue, which is exactly the kind of second-order effect
          the isPublic toggle needed visibilityConfirmCopy() to spell out.
        */}
        <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="toggle toggle-primary mt-0.5"
              checked={openForOpenSlot}
              onChange={(e) => setOpenForOpenSlot(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-on-surface">
                Open for open-slot registration
              </span>
              <span className="mt-1 block text-xs text-on-surface-variant">
                Lists this squad publicly at <code>/squads/browse</code> so signed-in players can
                ask to join. You approve or reject each request on the Players page - nobody is
                added automatically. This is separate from Visibility above: a private squad can
                still recruit, and a public one can stay closed. Approved players join as
                open-slot, so they don&apos;t take a full-time roster place.
              </span>
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-1">
              Absentee grace (playing days)
            </label>
            <input
              type="number"
              min={0}
              className={inputFieldClass}
              value={openSlotAbsenteeGraceDays}
              onChange={(e) => setOpenSlotAbsenteeGraceDays(Number(e.target.value))}
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Stop demeriting an open-slot player after this many playing days without a game.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-1">
              Visibility window (playing days)
            </label>
            <input
              type="number"
              min={0}
              className={inputFieldClass}
              value={openSlotVisibilityGameDays}
              onChange={(e) => setOpenSlotVisibilityGameDays(Number(e.target.value))}
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Drop an open-slot player off the leaderboard/graph after this many playing days
              without a game.
            </p>
          </div>
        </div>
        {openSlotError && <p className="text-sm text-red-400 mt-4">{openSlotError}</p>}
        {openSlotSaved && !openSlotError && <p className="text-sm text-primary mt-4">Saved.</p>}
        <div className="mt-4">
          <button type="submit" className={primaryBtn} disabled={isSavingOpenSlot}>
            {isSavingOpenSlot ? 'Saving…' : 'Save open-slot settings'}
          </button>
        </div>
      </form>

      <form onSubmit={handleSaveCheckIn} className={`${cardClass} mb-6`}>
        <h2 className={sectionTitleClass}>Game day check-in</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Opens an in/out vote for each playing day, runs an open-slot waiting list, closes voting at
          13:00 on the day and fills any gap from the waiting list - announced to your Telegram
          groups. Needs a recurring play schedule below. Turning it off cancels any vote still open.
        </p>
        <label className="mb-4 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={checkInEnabled}
            onChange={(e) => setCheckInEnabled(e.target.checked)}
          />
          <span className="text-sm font-medium text-on-surface">{checkInEnabled ? 'On' : 'Off'}</span>
        </label>
        {checkInEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={scheduleFieldLabelClass}>Vote opens (days before)</label>
              <input
                type="number"
                min={1}
                max={14}
                className={inputFieldClass}
                value={voteOpensDaysBefore}
                onChange={(e) => setVoteOpensDaysBefore(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={scheduleFieldLabelClass}>Open-slot minimum (players)</label>
              <input
                type="number"
                min={4}
                max={20}
                className={inputFieldClass}
                value={minPlayersForOpenSlot}
                placeholder="Off"
                onChange={(e) => setMinPlayersForOpenSlot(e.target.value)}
              />
              <p className="text-xs text-on-surface-variant mt-1">
                Below this, open-slot players are pinged at 09:00 and the waiting list fills the gap
                at 13:00. Leave empty to turn the open-slot flow off.
              </p>
            </div>
            <div>
              <label className={scheduleFieldLabelClass}>Main group chat id</label>
              <input
                className={inputFieldClass}
                value={telegramMainChatId}
                placeholder="-1001234567890"
                onChange={(e) => setTelegramMainChatId(e.target.value)}
              />
              <p className="text-xs text-on-surface-variant mt-1">Gets the vote link, the reminder and cancellations.</p>
            </div>
            <div>
              <label className={scheduleFieldLabelClass}>Open-slot group chat id</label>
              <input
                className={inputFieldClass}
                value={telegramOpenSlotChatId}
                placeholder="-1001234567890"
                onChange={(e) => setTelegramOpenSlotChatId(e.target.value)}
              />
              <p className="text-xs text-on-surface-variant mt-1">Gets the players-needed ping and slot updates.</p>
            </div>
          </div>
        )}
        {checkInError && <p className="text-sm text-red-400 mt-4">{checkInError}</p>}
        {checkInSaved && !checkInError && <p className="text-sm text-primary mt-4">{checkInSaved}</p>}
        <div className="mt-4">
          <button type="submit" className={primaryBtn} disabled={isSavingCheckIn}>
            {isSavingCheckIn ? 'Saving…' : 'Save check-in settings'}
          </button>
        </div>
      </form>

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

            <div>
              <label className={scheduleFieldLabelClass}>Timezone</label>
              <TimezonePicker value={timezone} onChange={setTimezone} label="Timezone" />
              <p className="text-xs text-on-surface-variant mt-1">
                The start and end times above are in this zone, as are the check-in vote&apos;s 09:00 / 10:00 / 13:00.
              </p>
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
