import React, { useState } from 'react';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import PageHeader from '@/components/leaderboard/PageHeader';
import { JoinRequestModal } from '@/components/squads/JoinRequestModal';
import { useMyJoinRequests, useOpenSquads } from '@/hooks/useSquadDirectory';
import type { DirectorySquad } from '@/lib/squadDirectory';
import type { MyJoinRequest } from '@/lib/joinRequests';

// The squad directory + the caller's own requests (SELF_REGISTRATION_PLAN.md).
//
// Deliberately a page of its own rather than part of /squads: that one redirects straight to the
// board when the caller belongs to exactly one squad, so anything placed there would be
// invisible to precisely the people this page serves - existing members looking for a second
// squad. It is a non-squad page, so there is no SquadProvider and nothing here may use
// useSquad().

const cardClass =
  'rounded-xl border border-gray-600 bg-surface-container/90 p-4 sm:p-5 transition-colors';

function statusBadge(status: MyJoinRequest['status']): { label: string; className: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', className: 'badge-warning' };
    case 'APPROVED':
      return { label: 'Approved', className: 'badge-success' };
    case 'REJECTED':
      return { label: 'Not accepted', className: 'badge-error' };
    default:
      return { label: 'Withdrawn', className: 'badge-ghost' };
  }
}

function rosterLine(squad: DirectorySquad): string {
  // maxPlayers caps the full-time roster only, so the cap is shown against the full-time count.
  // The total is a separate figure - comparing it to the cap would misreport how full a squad is.
  const cap =
    squad.maxPlayers !== null
      ? `${squad.fulltimePlayerCount}/${squad.maxPlayers} full-time`
      : `${squad.fulltimePlayerCount} full-time`;
  const openSlot = squad.playerCount - squad.fulltimePlayerCount;
  return openSlot > 0 ? `${cap} · ${openSlot} open-slot` : cap;
}

const SquadCard = ({
  squad,
  onRequest,
}: {
  squad: DirectorySquad;
  onRequest: (squad: DirectorySquad) => void;
}) => (
  <li className={cardClass}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h3 className="font-headline text-base font-semibold text-on-surface">{squad.name}</h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          {squad.scheduleSummary ?? 'Schedule not set'}
        </p>
        <p className="mt-0.5 text-sm text-on-surface-variant">{rosterLine(squad)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link href={`/s/${squad.slug}`} className="btn btn-ghost btn-sm">
          View board
        </Link>
        {squad.membership === 'none' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onRequest(squad)}>
            Request to join
          </button>
        )}
        {squad.membership === 'pending' && (
          <span className="badge badge-warning">Request pending</span>
        )}
        {squad.membership === 'member' && <span className="badge badge-success">You&apos;re a member</span>}
        {squad.membership === 'memberInactive' && (
          <span className="badge badge-ghost">On the roster (inactive)</span>
        )}
      </div>
    </div>

    {squad.membership === 'memberInactive' && (
      <p className="mt-3 text-xs text-on-surface-variant">
        You&apos;re already on this squad&apos;s roster but currently inactive — a squad admin can
        reactivate you.
      </p>
    )}
  </li>
);

const BrowseSquadsPage = () => {
  const { status } = useSession();
  const { squads, isLoading, error, mutate: refreshSquads } = useOpenSquads();
  const { requests, mutate: refreshRequests } = useMyJoinRequests();
  const [requesting, setRequesting] = useState<DirectorySquad | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null);
  const [withdrawError, setWithdrawError] = useState('');

  if (status === 'unauthenticated') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="space-y-4 text-center">
          <h1 className="font-headline text-2xl font-bold text-on-surface">Sign in to find a squad</h1>
          <p className="text-sm text-on-surface-variant">
            You need an account before you can ask to join a squad.
          </p>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 px-6 py-3 font-medium text-on-surface transition-colors hover:border-primary/40"
            onClick={() => signIn('google')}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const pending = requests.filter((request) => request.status === 'PENDING');
  const listedSquadIds = new Set(squads.map((squad) => squad.id));
  // A squad can close or be disabled while a request is pending. Those rows drop out of the
  // directory, so they're surfaced here explicitly - otherwise the requester would have no way
  // left to see or withdraw them.
  const orphanedPending = pending.filter((request) => !listedSquadIds.has(request.squadId));

  const withdraw = async (request: MyJoinRequest) => {
    setWithdrawError('');
    setWithdrawingId(request.id);
    try {
      const res = await fetch(`/api/squads/${request.squadId}/join-requests/${request.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to withdraw request');
      }
      await Promise.all([refreshRequests(), refreshSquads()]);
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : 'Failed to withdraw request');
    } finally {
      setWithdrawingId(null);
    }
  };

  return (
    <div className="min-h-screen pb-12">
      <PageHeader
        title="Find a squad"
        subtitle="Squads accepting new players. A squad admin reviews every request."
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-8">
        {pending.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
              Your requests
            </h2>
            {withdrawError && <p className="mb-3 text-sm text-error">{withdrawError}</p>}
            <ul className="space-y-2">
              {pending.map((request) => {
                const badge = statusBadge(request.status);
                return (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-600 bg-surface-container/90 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate font-headline text-sm font-semibold text-on-surface">
                      {request.squadName}
                    </span>
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                    {!request.squadStillOpen && (
                      <span className="text-xs text-on-surface-variant">
                        No longer accepting requests
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      disabled={withdrawingId === request.id}
                      onClick={() => withdraw(request)}
                    >
                      {withdrawingId === request.id ? 'Withdrawing…' : 'Withdraw'}
                    </button>
                  </li>
                );
              })}
            </ul>
            {orphanedPending.length > 0 && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Some of these squads have stopped accepting requests. They stay here so you can
                still withdraw them.
              </p>
            )}
          </section>
        )}

        <h2 className="mb-3 font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
          Open squads
        </h2>

        {isLoading ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : error ? (
          <p className="text-sm text-error">Couldn&apos;t load squads.</p>
        ) : squads.length === 0 ? (
          <div className="rounded-xl border border-gray-600 bg-surface-container/90 p-6 text-on-surface-variant">
            No squads are accepting new players right now. A squad admin has to turn this on in
            their squad settings.
          </div>
        ) : (
          <ul className="space-y-3">
            {squads.map((squad) => (
              <SquadCard key={squad.id} squad={squad} onRequest={setRequesting} />
            ))}
          </ul>
        )}

        <div className="mt-8">
          <Link href="/squads" className="font-headline text-sm font-semibold text-primary hover:text-primary-container">
            Back to your squads
          </Link>
        </div>
      </div>

      {requesting && (
        <JoinRequestModal
          squadId={requesting.id}
          squadName={requesting.name}
          onClose={() => setRequesting(null)}
          onSubmitted={() => {
            void refreshRequests();
            void refreshSquads();
          }}
        />
      )}
    </div>
  );
};

export default BrowseSquadsPage;

// Signed-out visitors get the sign-in prompt rendered above rather than a redirect, matching
// /squads. The session is resolved here only so that prompt doesn't flash for a signed-in user.
export const getServerSideProps: GetServerSideProps = async (context) => {
  await getServerSession(context.req, context.res, authOptions);
  return { props: {} };
};
