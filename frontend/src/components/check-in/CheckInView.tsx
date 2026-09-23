import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useOptionalSquad } from '@/contexts/SquadContext';
import {
  durationUntilLabel,
  formatLocalTime,
  formatSessionTimeRange,
  formatSessionTitle,
  sessionPhase,
  sessionStatusLabel,
} from '@/lib/check-in/schedule';
import type { CheckInVote, GameDayView } from '@/lib/check-in/types';
import { CheckInRoster } from './CheckInRoster';
import { NomineePanel, SlotHandOff } from './SlotHandOff';
import {
  CheckInVoteButtons,
  checkInButtonBase,
  checkInButtonIdle,
  checkInButtonOut,
  checkInButtonPrimary,
} from './CheckInVoteButtons';

export const profileBackLinkClass =
  'inline-flex min-h-11 items-center gap-1.5 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-primary';

export function ProfileBackLink({
  children = 'Profile',
  className = '',
}: {
  children?: string;
  className?: string;
}) {
  const squad = useOptionalSquad();
  const href = squad ? `/s/${squad.slug}/user/profile` : '/squads';

  return (
    <Link href={href} className={`${profileBackLinkClass} ${className}`.trim()}>
      <ArrowLeftIcon className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

interface CheckInViewProps {
  view: GameDayView;
  now: Date;
  avatarUrl?: string;
  pending?: boolean;
  actionError?: string | null;
  onVote: (vote: CheckInVote) => void;
  onJoinOrClaim: () => void;
  onLeave: () => void;
  // One-day slot hand-off (SINGLE_DAY_NOMINATION_PLAN.md).
  nominationUrl?: string | null;
  onNominate?: (nomineeId: number) => void;
  onRevokeNomination?: () => void;
}

function phaseChipClass(phase: ReturnType<typeof sessionPhase>): string {
  if (phase === 'live') return 'bg-primary/20 text-primary';
  if (phase === 'ended') return 'bg-white/10 text-on-surface-variant';
  return 'bg-white/5 text-on-surface-variant';
}

const sectionLabel = 'font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-80';
const note = 'mt-3 text-sm text-on-surface-variant';

function SessionHeader({
  view,
  now,
}: {
  view: GameDayView;
  now: Date;
}) {
  const phase = sessionPhase(view, now);
  const status =
    view.status === 'CANCELLED' ? 'Cancelled' : sessionStatusLabel(view, now);

  return (
    <div>
      <h2 className="font-headline text-xl font-bold text-on-surface">{formatSessionTitle(view)}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="font-numeric text-base tabular-nums text-primary" title={view.timezone}>
          {formatSessionTimeRange(view)}
        </p>
        {view.status !== 'CANCELLED' ? (
          <span
            className={`rounded-full px-2.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest ${phaseChipClass(phase)}`}
          >
            {status}
          </span>
        ) : (
          <span className="rounded-full bg-red-950/40 px-2.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-red-400">
            Cancelled
          </span>
        )}
      </div>
    </div>
  );
}

function CheckInStatCells({ view, now }: { view: GameDayView; now: Date }) {
  const closesAt = formatLocalTime(view.votesCloseAt, view.timezone);
  const voteCountdown =
    view.status === 'VOTING_OPEN'
      ? durationUntilLabel(new Date(view.votesCloseAt), now)
      : null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-gray-600 pt-3">
      <div className="min-w-0 text-left">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <p className={sectionLabel}>Voting closes</p>
          <p className="font-numeric text-xs font-normal normal-case tracking-normal tabular-nums text-on-surface-variant">
            at {closesAt}
          </p>
        </div>
        {voteCountdown ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-numeric text-lg font-bold tabular-nums text-on-surface">{voteCountdown}</span>
            <span className="text-sm text-on-surface-variant">left</span>
          </p>
        ) : (
          <p className="mt-0.5 font-numeric text-lg font-bold tabular-nums text-on-surface-variant">Closed</p>
        )}
      </div>
      <div className="min-w-0 text-right">
        <p className={sectionLabel}>Confirmed</p>
        <p className="mt-0.5 font-numeric text-lg font-bold tabular-nums text-on-surface">{view.counts.confirmedIn}</p>
      </div>
    </div>
  );
}

function VoterPanel({
  view,
  pending,
  onVote,
  rosterHidden,
}: Pick<CheckInViewProps, 'view' | 'pending' | 'onVote'> & { rosterHidden: boolean }) {
  const { actions, myOpenSlot } = view;
  const isDirect = view.holding === 'ASSIGNED' && myOpenSlot?.source === 'DIRECT';
  const lockTime = formatLocalTime(view.slotLockAt, view.timezone);
  const inDisabled = !actions.voteIn.ok || view.myVote === 'IN';
  const outDisabled = !actions.voteOut.ok || view.myVote === 'OUT';
  const canChangeVote =
    view.myVote !== null &&
    !isDirect &&
    (view.myVote === 'IN' ? actions.voteOut.ok : actions.voteIn.ok);

  const [changingVote, setChangingVote] = useState(false);
  useEffect(() => {
    setChangingVote(false);
  }, [view.myVote]);

  const showVoteButtons = view.myVote === null || (canChangeVote && changingVote);
  const refusal =
    showVoteButtons && view.myVote === 'IN' && !actions.voteOut.ok
      ? actions.voteOut
      : showVoteButtons && view.myVote === 'OUT' && !actions.voteIn.ok
        ? actions.voteIn
        : null;

  let context: string | null = null;
  if (view.myReservation) {
    context = `This slot was passed on to you after voting closed. Let everyone know whether you're coming${
      actions.voteIn.ok ? ` - you can confirm until ${lockTime}` : ''
    }.`;
  } else if (isDirect) {
    context = 'You claimed this slot directly, so it is yours - just confirm you are coming.';
  } else if (view.holding === 'ASSIGNED' && view.myVote === null) {
    context = `You've been given an open slot from the waiting list. Confirm you're coming, or give it back before ${lockTime} so someone else can have it.`;
  }

  return (
    <>
      <p className={sectionLabel}>Your vote</p>
      {rosterHidden && view.myVote === null ? (
        <p className="mt-2 text-sm text-on-surface-variant">Vote in or out to see who else is playing.</p>
      ) : null}
      {context ? <p className="mt-2 text-sm text-on-surface">{context}</p> : null}
      {canChangeVote && !changingVote ? (
        <button
          type="button"
          className={`${checkInButtonBase} ${checkInButtonIdle} mt-3 w-full sm:w-auto sm:min-w-[12rem]`}
          disabled={pending || view.status === 'CANCELLED'}
          aria-expanded={false}
          onClick={() => setChangingVote(true)}
        >
          Change your vote
        </button>
      ) : null}
      {showVoteButtons ? (
        <div className="mt-3">
          <CheckInVoteButtons
            myVote={view.myVote}
            onVote={onVote}
            disabled={pending || view.status === 'CANCELLED'}
            inDisabled={inDisabled}
            outDisabled={outDisabled}
            hideOut={isDirect}
          />
        </div>
      ) : null}
      {refusal && !refusal.ok && view.status !== 'CANCELLED' ? <p className={note}>{refusal.reason}.</p> : null}
    </>
  );
}

function OpenSlotPanel({ view, pending, onJoinOrClaim, onLeave }: Pick<CheckInViewProps, 'view' | 'pending' | 'onJoinOrClaim' | 'onLeave'>) {
  const { actions, myOpenSlot } = view;
  const closesAt = formatLocalTime(view.votesCloseAt, view.timezone);
  const vacancies = view.counts.vacancies ?? 0;

  let body: React.ReactNode;
  if (myOpenSlot?.status === 'WAITING') {
    body = (
      <>
        <p className="mt-2 text-sm text-on-surface">
          You&apos;re <span className="font-numeric tabular-nums">#{myOpenSlot.waitingPosition ?? '?'}</span> on the waiting
          list. It&apos;s first come, first served. When voting closes at {closesAt}, you&apos;ll get a slot if any are left.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button type="button" className={`${checkInButtonBase} ${checkInButtonPrimary}`} disabled aria-pressed>
            On the waiting list
          </button>
          <button
            type="button"
            className={`${checkInButtonBase} ${checkInButtonOut}`}
            disabled={pending || !actions.leaveWaitingList.ok}
            onClick={onLeave}
          >
            Leave waiting list
          </button>
        </div>
      </>
    );
  } else if (actions.joinWaitingList.ok) {
    body = (
      <>
        <p className="mt-2 text-sm text-on-surface">
          Join the waiting list for an open slot. It&apos;s first come, first served. When voting closes at {closesAt},
          you&apos;ll get a slot if any are left.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button type="button" className={`${checkInButtonBase} ${checkInButtonPrimary}`} disabled={pending} onClick={onJoinOrClaim}>
            Join waiting list
          </button>
        </div>
      </>
    );
  } else if (actions.claimSlot.ok) {
    body = (
      <>
        <p className="mt-2 text-sm text-on-surface">
          <span className="font-numeric tabular-nums">{vacancies}</span> open {vacancies === 1 ? 'slot' : 'slots'} - first come,
          first served. A slot you claim is yours for the evening.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button type="button" className={`${checkInButtonBase} ${checkInButtonPrimary}`} disabled={pending} onClick={onJoinOrClaim}>
            Claim a slot
          </button>
        </div>
      </>
    );
  } else {
    const reason = view.status === 'VOTING_OPEN' ? actions.joinWaitingList : actions.claimSlot;
    body = <p className="mt-2 text-sm text-on-surface-variant">{!reason.ok ? `${reason.reason}.` : null}</p>;
  }

  return (
    <>
      <p className={sectionLabel}>Open slot</p>
      {body}
    </>
  );
}

export function CheckInView({
  view,
  now,
  avatarUrl,
  pending,
  actionError,
  onVote,
  onJoinOrClaim,
  onLeave,
  nominationUrl = null,
  onNominate,
  onRevokeNomination,
}: CheckInViewProps) {
  const showRoster = view.rosterVisible && view.roster !== null;

  return (
    <div className="max-w-3xl">
      <section className="rounded-xl border border-gray-600 bg-surface-container/90 p-4 sm:p-5 motion-safe:animate-fadeIn">
        <SessionHeader view={view} now={now} />

        {view.status === 'CANCELLED' ? (
          <p className="mt-3 text-sm font-semibold text-red-400">This session has been cancelled.</p>
        ) : (
          <CheckInStatCells view={view} now={now} />
        )}

        {showRoster ? (
          <CheckInRoster
            nested
            myVote={view.myVote}
            inPlayers={view.roster!.in}
            outPlayers={view.roster!.out}
            awaitingConfirmation={view.roster!.awaitingConfirmation}
            waitingCount={view.roster!.waitingCount}
            currentPlayerId={view.myPlayerId ?? undefined}
            avatarUrl={avatarUrl}
          />
        ) : null}

        {view.status !== 'CANCELLED' ? (
          <div className="mt-4 border-t border-gray-600 pt-4">
            {view.role === 'VOTER' ? (
              <>
                <VoterPanel view={view} pending={pending} onVote={onVote} rosterHidden={!showRoster} />
                {onNominate && onRevokeNomination ? (
                  <SlotHandOff
                    view={view}
                    nominationUrl={nominationUrl}
                    pending={pending}
                    onNominate={onNominate}
                    onRevoke={onRevokeNomination}
                  />
                ) : null}
              </>
            ) : view.role === 'NOMINEE' ? (
              <NomineePanel view={view} />
            ) : view.role === 'OPEN_SLOT' ? (
              <OpenSlotPanel view={view} pending={pending} onJoinOrClaim={onJoinOrClaim} onLeave={onLeave} />
            ) : (
              <>
                <p className={sectionLabel}>Viewing only</p>
                <p className="mt-2 text-sm text-on-surface-variant">{view.observerReason}</p>
              </>
            )}

            {actionError ? (
              <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-950/20 px-4 py-3 text-sm text-red-400">
                {actionError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function CheckInNotFound() {
  return (
    <div className="max-w-lg text-center">
      <h2 className="font-headline text-2xl font-bold text-on-surface">Session not found</h2>
      <p className="mt-2 text-on-surface-variant">
        There&apos;s no game day on that date. Pick an upcoming session from your profile.
      </p>
      <p className="mt-6 flex justify-center">
        <ProfileBackLink>Go to profile</ProfileBackLink>
      </p>
    </div>
  );
}
