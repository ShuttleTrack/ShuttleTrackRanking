import React, { useState } from 'react';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { PageLoader } from '@/components/common/GameLoader';
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

const cardClass = 'rounded-xl border border-gray-600 bg-surface-container p-4 sm:p-5';

const primaryBtn =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const outlineBtn =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-white/10 bg-surface-container-high/50 px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:border-primary/40';
const cardActionBtn = 'flex flex-1 min-h-[44px] items-center justify-center';
const ghostBtn =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm text-on-surface transition-colors hover:border-primary/40 disabled:opacity-50';

const sectionHeadingClass =
  'mb-3 font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant';

const chipWarning =
  'inline-flex rounded-lg bg-primary/15 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-primary';
const chipMuted =
  'inline-flex rounded-lg border border-white/10 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant';
const chipSuccess =
  'inline-flex rounded-lg bg-primary/15 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-primary';

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function rosterLine(squad: DirectorySquad): string {
  if (squad.fulltimePlayerCount === 0) {
    return 'No players yet';
  }
  if (squad.maxPlayers !== null) {
    return `${squad.fulltimePlayerCount} of ${squad.maxPlayers} players`;
  }
  return `${squad.fulltimePlayerCount} players`;
}

function metaLine(squad: DirectorySquad): string {
  const roster = rosterLine(squad);
  return squad.scheduleSummary ? `${squad.scheduleSummary} · ${roster}` : roster;
}

const SquadCard = ({
  squad,
  onRequest,
}: {
  squad: DirectorySquad;
  onRequest: (squad: DirectorySquad) => void;
}) => (
  <li className={cardClass}>
    <div className="flex items-start gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] font-headline text-xs font-bold text-on-surface-variant"
        aria-hidden
      >
        {monogram(squad.name)}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-headline text-lg font-semibold text-on-surface">{squad.name}</h3>
        <p className="mt-1 text-sm text-on-surface-variant">{metaLine(squad)}</p>
      </div>
    </div>

    <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
      <Link href={`/s/${squad.slug}`} className={`${outlineBtn} ${cardActionBtn}`}>
        View board
      </Link>
      {squad.membership === 'none' && (
        <button
          type="button"
          className={`${primaryBtn} ${cardActionBtn}`}
          onClick={() => onRequest(squad)}
        >
          Request to join
        </button>
      )}
      {squad.membership === 'pending' && (
        <span className={`${chipWarning} ${cardActionBtn} text-center`}>Request pending</span>
      )}
      {squad.membership === 'member' && (
        <span className={`${chipSuccess} ${cardActionBtn} text-center`}>You&apos;re in</span>
      )}
      {squad.membership === 'memberInactive' && (
        <span className={`${chipMuted} ${cardActionBtn} text-center text-[10px] leading-snug px-2`}>
          Inactive — ask an admin to reactivate you
        </span>
      )}
    </div>
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
          <h1 className="font-headline text-2xl font-bold text-on-surface">Sign in to join a squad</h1>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90"
            onClick={() => signIn('google')}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (status === 'loading' || isLoading) {
    return <PageLoader variant="tall" label="Loading" />;
  }

  const pending = requests.filter((request) => request.status === 'PENDING');

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
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <header className="mb-6">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Join a squad
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
        <p className="mt-2 text-xs text-on-surface-variant">Subject to approval by squad admin</p>
      </header>

      <div className="max-w-3xl">
        {pending.length > 0 && (
          <section className="mb-8">
            <h2 className={sectionHeadingClass}>Your requests</h2>
            {withdrawError && <p className="mb-3 text-sm text-error">{withdrawError}</p>}
            <ul className="space-y-2">
              {pending.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-600 bg-surface-container px-4 py-3"
                >
                  <span className="min-w-0 flex-1 truncate font-headline text-sm font-semibold text-on-surface">
                    {request.squadName}
                  </span>
                  <span className={chipWarning}>Request pending</span>
                  {!request.squadStillOpen && (
                    <span className="text-xs text-on-surface-variant">
                      This squad closed join requests
                    </span>
                  )}
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={withdrawingId === request.id}
                    onClick={() => withdraw(request)}
                  >
                    {withdrawingId === request.id ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error ? (
          <p className="text-sm text-error">Couldn&apos;t load squads.</p>
        ) : squads.length === 0 ? (
          <div className="rounded-xl border border-gray-600 bg-surface-container px-6 py-12 text-center">
            <h2 className="font-headline text-lg font-semibold text-on-surface">No open squads</h2>
            <p className="mt-2 text-on-surface-variant">None are looking for players right now.</p>
          </div>
        ) : (
          <>
            <h2 className={sectionHeadingClass}>Open squads</h2>
            <ul className="space-y-3">
              {squads.map((squad) => (
                <SquadCard key={squad.id} squad={squad} onRequest={setRequesting} />
              ))}
            </ul>
          </>
        )}
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
