import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useOptionalSquad } from '@/contexts/SquadContext';
import {
  formatLocalTime,
  formatSessionTimeRange,
  formatSessionTitle,
  sessionPhase,
  sessionStatusLabel,
} from '@/lib/check-in/schedule';
import type { CheckInVote, GameDayView } from '@/lib/check-in/types';
import { CheckInRoster } from './CheckInRoster';
import {
  CheckInVoteButtons,
  checkInButtonBase,
  checkInButtonIdle,
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
}

function phaseChipClass(phase: ReturnType<typeof sessionPhase>): string {
  if (phase === 'live') return 'bg-primary/20 text-primary';
  if (phase === 'ended') return 'bg-white/10 text-on-surface-variant';
  return 'bg-white/5 text-on-surface-variant';
}

const sectionLabel = 'font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-80';
const note = 'mt-3 text-sm text-on-surface-variant';

function VotingStatusLine({ view }: { view: GameDayView }) {
  const closesAt = formatLocalTime(view.votesCloseAt, view.timezone);
  if (view.status === 'CANCELLED') {
    return <p className="mt-4 text-sm font-semibold text-red-400">This session has been cancelled.</p>;
  }
  const tally =
    view.minPlayers === null ? `${view.counts.confirmedIn} in` : `${view.counts.confirmedIn} of ${view.minPlayers} in`;
  return (
    <p className="mt-4 text-sm text-on-surface-variant">
      {view.status === 'VOTING_OPEN' ? `Voting closes at ${closesAt} on the day` : `Voting closed at ${closesAt}`}
      <span aria-hidden> · </span>
      <span className="font-numeric tabular-nums">{tally}</span>
    </p>
  );
}

function VoterPanel({ view, pending, onVote }: Pick<CheckInViewProps, 'view' | 'pending' | 'onVote'>) {
  const { actions, myOpenSlot } = view;
  const isDirect = view.holding === 'ASSIGNED' && myOpenSlot?.source === 'DIRECT';
  const lockTime = formatLocalTime(view.slotLockAt, view.timezone);
  // A button stays enabled while it is your current choice, even when switching to it again would
  // be refused, so the selected state still reads as selected rather than greyed out.
  const inDisabled = !actions.voteIn.ok && view.myVote !== 'IN';
  const outDisabled = !actions.voteOut.ok && view.myVote !== 'OUT';
  const refusal = inDisabled ? actions.voteIn : outDisabled ? actions.voteOut : null;

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
      {context ? <p className="mt-2 text-sm text-on-surface">{context}</p> : null}
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
          list. Slots are handed out in join order when voting closes at {closesAt}.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button type="button" className={`${checkInButtonBase} ${checkInButtonPrimary}`} disabled aria-pressed>
            On the waiting list
          </button>
          <button
            type="button"
            className={`${checkInButtonBase} ${checkInButtonIdle}`}
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
          You don&apos;t hold a regular slot for this session. Join the waiting list and you&apos;ll be given one, in join
          order, if the session is short when voting closes at {closesAt}.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button type="button" className={`${checkInButtonBase} ${checkInButtonIdle}`} disabled={pending} onClick={onJoinOrClaim}>
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

export function CheckInView({ view, now, avatarUrl, pending, actionError, onVote, onJoinOrClaim, onLeave }: CheckInViewProps) {
  const phase = sessionPhase(view, now);
  const status = view.status === 'CANCELLED' ? 'Cancelled' : sessionStatusLabel(view, now);
  const showRoster = view.rosterVisible && view.roster !== null;

  return (
    <div className="max-w-3xl">
      <section className="rounded-xl border border-gray-600 bg-surface-container/90 p-5 sm:p-6 motion-safe:animate-fadeIn">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-headline text-xl font-bold text-on-surface sm:text-2xl">{formatSessionTitle(view)}</h2>
            <p className="mt-1 font-numeric text-lg tabular-nums text-primary">{formatSessionTimeRange(view)}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{view.timezone}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 font-label text-[10px] font-bold uppercase tracking-widest ${
              view.status === 'CANCELLED' ? 'bg-red-950/40 text-red-400' : phaseChipClass(phase)
            }`}
          >
            {status}
          </span>
        </div>

        <VotingStatusLine view={view} />

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
          <div className={showRoster ? 'mt-6 border-t border-gray-600 pt-5' : 'mt-6'}>
            {view.role === 'VOTER' ? (
              <VoterPanel view={view} pending={pending} onVote={onVote} />
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

            {!showRoster ? (
              <p className="mt-4 text-sm text-on-surface-variant">Vote in or out to see who else is playing.</p>
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
