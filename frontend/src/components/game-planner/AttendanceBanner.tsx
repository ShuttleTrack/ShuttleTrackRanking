import type { GameDayAttendance } from '@/lib/check-in/types';
import { capitalizeFirstLetter } from '@/utils/string';

interface AttendanceBannerProps {
  attendance: GameDayAttendance;
  preTickedCount: number;
  onReleaseSlot?: (playerId: number) => void;
  releasing?: boolean;
}

const names = (players: { name: string }[]) => players.map((p) => capitalizeFirstLetter(p.name)).join(', ');

// Game Planner's view of today's closed vote (ATTENDANCE_VOTE_PLAN.md, "UI"): the confirmed
// players are pre-ticked; this names everyone the admin still has to decide about rather than
// finding them silently ticked - anyone who dropped out after the deadline, and everyone holding a
// slot without having confirmed (an assigned open slot, or a slot passed on after the deadline).
export function AttendanceBanner({ attendance, preTickedCount, onReleaseSlot, releasing }: AttendanceBannerProps) {
  const { confirmed, unconfirmed, outAfterDeadline, gameId } = attendance;
  const droppedCount = confirmed.length - preTickedCount;
  // One-day hand-offs (SINGLE_DAY_NOMINATION_PLAN.md): already pre-ticked in place of the slot
  // holder - named here so nobody wonders why the holder is missing from the selection.
  const standIns = confirmed.filter((p) => p.standingInFor !== null);

  return (
    <section className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-on-surface" aria-label="Check-in attendance">
      <p className="font-semibold">
        Pre-selected from today&apos;s check-in: <span className="font-numeric tabular-nums">{preTickedCount}</span> confirmed
        {attendance.minPlayers !== null ? ` (minimum ${attendance.minPlayers})` : ''}.
      </p>
      {gameId ? (
        <p className="mt-2 text-red-400">
          A game has already been planned from this check-in ({gameId}) - open it from Game Day rather than creating another.
        </p>
      ) : null}
      {droppedCount > 0 ? (
        <p className="mt-2 text-on-surface-variant">
          {droppedCount} confirmed {droppedCount === 1 ? 'player is' : 'players are'} not in today&apos;s roster below (disabled, or
          not available today) and could not be pre-selected.
        </p>
      ) : null}
      {standIns.length > 0 ? (
        <p className="mt-2">
          <span className="font-semibold">Playing in someone else&apos;s slot:</span>{' '}
          {standIns
            .map((p) => `${capitalizeFirstLetter(p.name)} (for ${capitalizeFirstLetter(p.standingInFor!.name)})`)
            .join(', ')}
        </p>
      ) : null}
      {outAfterDeadline.length > 0 ? (
        <p className="mt-2">
          <span className="font-semibold text-red-400">Dropped out after the deadline:</span> {names(outAfterDeadline)}
        </p>
      ) : null}
      {unconfirmed.length > 0 ? (
        <div className="mt-2">
          <p>
            <span className="font-semibold">Holding a slot, not yet confirmed</span> - not pre-selected; tick them if they turn up:
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {unconfirmed.map((p) => (
              <li
                key={p.id}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-0.5 pl-3 pr-1"
              >
                <span>{capitalizeFirstLetter(p.name)}</span>
                <span className="font-label text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                  {p.reason === 'INHERITED' ? 'slot passed on' : p.source === 'DIRECT' ? 'claimed' : 'from waiting list'}
                </span>
                {onReleaseSlot && p.reason === 'ASSIGNED' ? (
                  <button
                    type="button"
                    className="rounded-full px-2 py-0.5 text-xs text-on-surface-variant hover:bg-white/10 hover:text-red-400 disabled:opacity-50"
                    disabled={releasing}
                    onClick={() => onReleaseSlot(p.id)}
                    aria-label={`Release ${p.name}'s slot`}
                  >
                    Release
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
