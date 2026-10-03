import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { format } from 'date-fns';
import type { GetServerSideProps } from 'next';
import { ArrowDownTrayIcon, ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadAdminOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';
import type {
  AttendanceList,
  OpenSlotAttendanceDay,
  OpenSlotAttendanceReport,
} from '@/lib/reports/openSlotAttendance';

const cardClass = 'rounded-xl bg-surface-container/90 border border-gray-600 p-4 sm:p-6';
const outlineBtn =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface-container-high/50 px-4 py-2 font-medium text-on-surface transition-colors hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed';
const iconBtn =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 text-on-surface transition-colors hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed';
const selectClass =
  'min-h-[44px] w-full min-w-0 rounded-xl border border-gray-600 bg-surface-container px-4 py-2 text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';
const noteChipClass =
  'inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300';
const mutedChipClass =
  'inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-on-surface-variant';

const LISTS: { key: AttendanceList; title: string; description: string; empty: string; accent: string }[] = [
  {
    key: 'registeredAndPlayed',
    title: 'Registered and played',
    description: 'Held a place through the check-in and played at least one recorded match.',
    empty: 'Nobody.',
    accent: 'bg-primary',
  },
  {
    key: 'registeredNotPlayed',
    title: 'Registered but not played',
    description: 'Held a place through the check-in but played no recorded match.',
    empty: 'Nobody - every registered player played.',
    accent: 'bg-amber-400',
  },
  {
    key: 'playedNotRegistered',
    title: 'Played without registering',
    description: 'Played a recorded match without holding a place (waiting list only, or no check-in).',
    empty: 'Nobody.',
    accent: 'bg-red-400',
  },
];

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch open-slot attendance');
  return res.json();
};

// Date-only strings are UTC midnight; parse as local midnight so date-fns doesn't shift the day.
const formatDay = (iso: string) => format(new Date(`${iso}T00:00:00`), 'EEE, d MMM yyyy');

// The dropdown label: the date plus a compact count of each list, so a day that needs a look
// (no-shows, unregistered players) stands out without opening it.
const dayOptionLabel = (day: OpenSlotAttendanceDay) =>
  `${formatDay(day.date)}  ·  ${day.registeredAndPlayed.length} / ${day.registeredNotPlayed.length} / ${day.playedNotRegistered.length}`;

function toCsv(report: OpenSlotAttendanceReport): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const rows = [['Date', 'List', 'Player', 'Matches', 'Notes']];
  for (const day of [...report.days].reverse()) {
    for (const list of LISTS) {
      for (const player of day[list.key]) {
        rows.push([day.date, list.title, player.name, String(player.matches), player.notes.join('; ')]);
      }
    }
  }
  return rows.map((row) => row.map(escape).join(',')).join('\n');
}

const OpenSlotAttendancePage = () => {
  const { id: squadId, slug } = useSquad();
  const { data: report, error, isLoading } = useSWR<OpenSlotAttendanceReport>(
    `/api/squads/${squadId}/reports/open-slot-attendance`,
    fetcher
  );
  // Null = the newest day; set once the admin picks one.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const days = report?.days ?? [];
  const index = Math.max(0, selectedDate ? days.findIndex((day) => day.date === selectedDate) : 0);
  const day = days[index];

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `open-slot-attendance-${slug}-${report.from}-to-${report.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <PageLoader variant="compact" label="Loading open-slot attendance" />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <Link
        href={`/s/${slug}/admin/dashboard`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden />
        Dashboard
      </Link>
      <section className="mb-6 sm:mb-8">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Open-Slot Attendance
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
        <p className="text-on-surface-variant text-sm sm:text-base mt-2">
          Open-slot players&apos; check-in registrations against the matches recorded in the app, one day at a
          time{report && ` (${formatDay(report.from)} – ${formatDay(report.to)})`}.
        </p>
      </section>

      {error || !report ? (
        <div className={cardClass}>
          <p className="text-red-400">Couldn&apos;t load open-slot attendance.</p>
        </div>
      ) : !day ? (
        <div className={cardClass}>
          <p className="text-center py-8 text-on-surface-variant">No game days in the last two months.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className={cardClass}>
            <label
              htmlFor="attendance-day"
              className="mb-1 block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant/60"
            >
              Day
            </label>
            <div className="flex items-center gap-2">
              {/* Days are newest first, so "previous" (older) moves down the list. */}
              <button
                type="button"
                className={iconBtn}
                aria-label="Previous day"
                disabled={index >= days.length - 1}
                onClick={() => setSelectedDate(days[index + 1].date)}
              >
                <ChevronLeftIcon className="h-5 w-5" aria-hidden />
              </button>
              <select
                id="attendance-day"
                className={selectClass}
                value={day.date}
                onChange={(event) => setSelectedDate(event.target.value)}
              >
                {days.map((option) => (
                  <option key={option.date} value={option.date}>
                    {dayOptionLabel(option)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={iconBtn}
                aria-label="Next day"
                disabled={index === 0}
                onClick={() => setSelectedDate(days[index - 1].date)}
              >
                <ChevronRightIcon className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-on-surface-variant">
                Counts: registered &amp; played / registered, not played / played, not registered
              </p>
              <button type="button" className={outlineBtn} onClick={handleDownload}>
                <ArrowDownTrayIcon className="h-5 w-5 shrink-0" aria-hidden />
                Download CSV (all days)
              </button>
            </div>
            {day.noCheckIn && (
              <p className="mt-3">
                <span className={mutedChipClass}>
                  No check-in this day - nobody could register, so everyone who played is listed as unregistered.
                </span>
              </p>
            )}
          </div>

          {LISTS.map((list) => {
            const players = day[list.key];
            return (
              <section key={list.key} className={cardClass}>
                <div className="mb-1 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${list.accent}`} aria-hidden />
                  <h2 className="font-headline text-base sm:text-lg font-semibold text-on-surface">{list.title}</h2>
                  <span className="ml-auto text-xs text-on-surface-variant tabular-nums">
                    {players.length} player{players.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="mb-3 text-sm text-on-surface-variant">{list.description}</p>
                {players.length === 0 ? (
                  <p className="py-2 text-sm text-on-surface-variant">{list.empty}</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {players.map((player) => (
                      <li key={player.playerId} className="flex flex-wrap items-center gap-2 py-2 text-sm text-on-surface">
                        <span>{player.name}</span>
                        {player.matches > 0 && (
                          <span className="text-xs text-on-surface-variant">
                            {player.matches} match{player.matches === 1 ? '' : 'es'}
                          </span>
                        )}
                        {player.notes.map((note) => (
                          <span key={note} className={noteChipClass}>
                            {note}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OpenSlotAttendancePage;

export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadAdminOrRedirect(context);
};
