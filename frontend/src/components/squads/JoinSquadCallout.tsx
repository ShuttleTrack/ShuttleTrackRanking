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
// Renders nothing unless the squad is open for registration and the viewer is a signed-in
// non-member. Safe to call useSquad() here: this only ever mounts inside a squad page tree.
export function JoinSquadCallout() {
  const squad = useSquad();
  const { status } = useSession();
  const { requests, mutate } = useMyJoinRequests();
  const [open, setOpen] = useState(false);

  if (!squad.openForOpenSlot || squad.isPlayerHere) return null;

  if (status === 'unauthenticated') {
    return (
      <div className="mx-auto mb-4 max-w-5xl px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm text-on-surface-variant">
            This squad is looking for players.
          </p>
          <Link href="/login" className="btn btn-primary btn-sm">
            Sign in to request a spot
          </Link>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated') return null;

  const pending = requests.some(
    (request) => request.squadId === squad.id && request.status === 'PENDING'
  );

  return (
    <div className="mx-auto mb-4 max-w-5xl px-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <p className="text-sm text-on-surface-variant">
          {pending
            ? 'Your request to join this squad is waiting for an admin to review it.'
            : 'This squad is open to new players. A squad admin reviews every request.'}
        </p>
        {pending ? (
          <span className="badge badge-warning">Request pending</span>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            Request to join
          </button>
        )}
      </div>

      {open && (
        <JoinRequestModal
          squadId={squad.id}
          squadName={squad.name}
          onClose={() => setOpen(false)}
          onSubmitted={() => void mutate()}
        />
      )}
    </div>
  );
}
