import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useSquad } from '@/contexts/SquadContext';
import { useMyJoinRequests } from '@/hooks/useSquadDirectory';
import { JoinRequestModal } from './JoinRequestModal';

// "Request to join" on the squad's own public board (SELF_REGISTRATION_PLAN.md).
//
// The board is link-public and is where someone handed a share link actually lands, so this is
// the natural place to ask - sending them off to the directory to find the squad they are
// already looking at would be silly.
//
// Call useJoinSquadCallout() once (e.g. in RankingsComponent) and render inline + modal - inline
// is meant to be passed as SquadBoardSelector's `trailing` slot so it lives inside the same
// striped selector band rather than floating above it on mobile.

const barClass =
  'flex min-h-[32px] w-[90%] items-center justify-between gap-3 rounded-lg bg-surface-container-high px-3 py-1 sm:w-auto sm:min-w-[18rem] md:max-w-md';
const copyClass =
  'min-w-0 flex-1 truncate font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant';
const primaryCtaClass =
  'inline-flex min-h-[28px] shrink-0 items-center justify-center rounded bg-primary px-2.5 font-label text-[11px] font-semibold uppercase tracking-widest text-black transition-opacity hover:opacity-90';
const pendingChipClass =
  'inline-flex min-h-[28px] shrink-0 items-center rounded bg-primary/15 px-2 font-label text-[10px] font-bold uppercase tracking-widest text-primary';

export function JoinSquadCalloutBar({
  pending,
  onRequest,
}: {
  pending: boolean;
  onRequest: () => void;
}) {
  const { status } = useSession();

  return (
    <div className={barClass}>
      <p className={copyClass}>Want to play here?</p>
      {status === 'unauthenticated' ? (
        <Link href="/login" className={primaryCtaClass}>
          Sign in
        </Link>
      ) : pending ? (
        <span className={pendingChipClass}>Request pending</span>
      ) : (
        <button type="button" className={primaryCtaClass} onClick={onRequest}>
          Request a spot
        </button>
      )}
    </div>
  );
}

export function useJoinSquadCallout() {
  const squad = useSquad();
  const { status } = useSession();
  const { requests, mutate } = useMyJoinRequests();
  const [open, setOpen] = useState(false);

  if (!squad.openForOpenSlot || squad.isPlayerHere) return null;
  if (status !== 'authenticated' && status !== 'unauthenticated') return null;

  const pending =
    status === 'authenticated' &&
    requests.some((request) => request.squadId === squad.id && request.status === 'PENDING');

  const onRequest = () => setOpen(true);

  return {
    inline: (
      <div className="flex w-full min-w-0 justify-center md:w-auto md:justify-end">
        <JoinSquadCalloutBar pending={pending} onRequest={onRequest} />
      </div>
    ),
    modal:
      open && status === 'authenticated' ? (
        <JoinRequestModal
          squadId={squad.id}
          squadName={squad.name}
          onClose={() => setOpen(false)}
          onSubmitted={() => void mutate()}
        />
      ) : null,
  };
}
