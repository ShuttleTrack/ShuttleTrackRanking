import { useState } from 'react';
import useSWR from 'swr';
import type { GameDayView } from '@/lib/check-in/types';
import { formatLocalTime } from '@/lib/check-in/schedule';
import { capitalizeFirstLetter } from '@/utils/string';
import { checkInButtonBase, checkInButtonIdle, checkInButtonOut, checkInButtonPrimary } from './CheckInVoteButtons';

interface NomineeOption {
  id: number;
  name: string;
  maskedEmail: string;
}

// Masked addresses only, exactly like the period-replacement picker - the route is open to any
// squad member. A non-OK answer (voting just closed, say) reads as "no options" rather than
// throwing: the page's own refresh brings the reason with it.
const fetcher = async (url: string): Promise<NomineeOption[]> => {
  const res = await fetch(url);
  return res.ok ? res.json() : [];
};

const sectionLabel = 'font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-80';
const inputClass =
  'w-full rounded-xl border border-gray-600 bg-surface-container px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';

const display = (name: string) => capitalizeFirstLetter(name);

function NomineePicker({
  nominationUrl,
  pending,
  onPick,
  onCancel,
}: {
  nominationUrl: string;
  pending?: boolean;
  onPick: (option: NomineeOption) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  // Listed straight away, not only once something is typed: a squad's open-slot pool is small.
  const { data: options } = useSWR<NomineeOption[]>(`${nominationUrl}?query=${encodeURIComponent(query.trim())}`, fetcher);

  return (
    <div className="mt-3">
      <input
        type="text"
        className={inputClass}
        placeholder="Search open-slot players by name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search open-slot players"
      />
      {options ? (
        <div className="mt-2 divide-y divide-gray-600 overflow-hidden rounded-xl border border-gray-600 bg-surface-container-high">
          {options.length === 0 ? (
            <p className="px-4 py-3 text-sm text-on-surface-variant">No open-slot players available.</p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-container disabled:opacity-50"
                disabled={pending}
                onClick={() => onPick(option)}
              >
                <div className="font-medium text-on-surface">{display(option.name)}</div>
                <div className="text-xs text-on-surface-variant">{option.maskedEmail}</div>
              </button>
            ))
          )}
        </div>
      ) : null}
      <button type="button" className={`${checkInButtonBase} ${checkInButtonIdle} mt-3 w-full sm:w-auto sm:min-w-[10rem]`} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

// A fulltime holder passing their slot to one open-slot player for this game day
// (SINGLE_DAY_NOMINATION_PLAN.md). Arranged between the two of them beforehand: the holder keeps
// the vote, so "can't come" is always "tell the holder, who votes I'm out".
export function SlotHandOff({
  view,
  nominationUrl,
  pending,
  onNominate,
  onRevoke,
}: {
  view: GameDayView;
  nominationUrl: string | null;
  pending?: boolean;
  onNominate: (nomineeId: number) => void;
  onRevoke: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'picking' | 'confirming'>('idle');
  const [picked, setPicked] = useState<NomineeOption | null>(null);
  const mine = view.nomination.mine;
  const changeable = view.actions.nominate.ok;
  const closesAt = formatLocalTime(view.votesCloseAt, view.timezone);

  if (!mine && !changeable) return null;

  const reset = () => {
    setMode('idle');
    setPicked(null);
  };

  let body: React.ReactNode;
  if (mode === 'confirming' && picked) {
    body = (
      <>
        <p className="mt-2 text-sm text-on-surface">
          {display(picked.name)} will play in your slot. If {display(picked.name)} can&apos;t come, vote <b>I&apos;m out</b>.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button
            type="button"
            className={`${checkInButtonBase} ${checkInButtonPrimary}`}
            disabled={pending}
            onClick={() => {
              onNominate(picked.id);
              reset();
            }}
          >
            Pass my slot to {display(picked.name)}
          </button>
          <button type="button" className={`${checkInButtonBase} ${checkInButtonIdle}`} onClick={reset}>
            Cancel
          </button>
        </div>
      </>
    );
  } else if (mode === 'picking' && nominationUrl) {
    body = (
      <NomineePicker
        nominationUrl={nominationUrl}
        pending={pending}
        onPick={(option) => {
          setPicked(option);
          setMode('confirming');
        }}
        onCancel={reset}
      />
    );
  } else if (mine) {
    const name = display(mine.nomineeName);
    body = (
      <>
        <p className="mt-2 text-sm text-on-surface">
          <span className="font-semibold">{name}</span> is playing in your slot.{' '}
          {changeable
            ? `You can change this until ${closesAt}. If ${name} can't come, vote I'm out.`
            : `This is locked in now that voting has closed. If ${name} can't come, vote I'm out.`}
        </p>
        {changeable ? (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <button type="button" className={`${checkInButtonBase} ${checkInButtonIdle}`} disabled={pending} onClick={() => setMode('picking')}>
              Change
            </button>
            <button type="button" className={`${checkInButtonBase} ${checkInButtonOut}`} disabled={pending} onClick={onRevoke}>
              Take it back
            </button>
          </div>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <p className="mt-2 text-sm text-on-surface-variant">
          Can&apos;t make it, but arranged for an open-slot player to take your place? Pass your slot to them for this session,
          before {closesAt}.
        </p>
        <button
          type="button"
          className={`${checkInButtonBase} ${checkInButtonIdle} mt-3 w-full sm:w-auto sm:min-w-[12rem]`}
          disabled={pending || !nominationUrl}
          onClick={() => setMode('picking')}
        >
          Pass my slot to…
        </button>
      </>
    );
  }

  return (
    <div className="mt-5 border-t border-gray-600 pt-4">
      <p className={sectionLabel}>Slot hand-off</p>
      {body}
    </div>
  );
}

// What the nominee sees: no vote, no waiting list - just the arrangement, and who to tell.
export function NomineePanel({ view }: { view: GameDayView }) {
  const holder = view.nomination.standingInFor;
  if (!holder) return null;
  const name = display(holder.name);
  return (
    <>
      <p className={sectionLabel}>Your slot</p>
      <p className="mt-2 text-sm text-on-surface">
        You&apos;re playing in <span className="font-semibold">{name}</span>&apos;s slot this session. Can&apos;t make it? Tell{' '}
        {name} - {name} holds the vote for this slot.
      </p>
    </>
  );
}
