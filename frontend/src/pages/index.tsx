import React from 'react';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import useSWR from 'swr';
import type { Squad } from '@prisma/client';
import { PageLoader } from '@/components/common/GameLoader';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Not squad-scoped - lists the squads the signed-in email administers or plays in (or every
// squad, for a platform superadmin), so there's no SquadContext/SquadProvider here.
const SquadPickerPage = () => {
  const { data: session, status } = useSession();
  const { data: squads, isLoading } = useSWR<Squad[]>(
    status === 'authenticated' ? '/api/squads' : null,
    fetcher
  );

  if (status === 'loading') {
    return <PageLoader variant="tall" label="Loading" />;
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center space-y-4">
          <h1 className="font-headline text-2xl font-bold text-on-surface">Sign in to continue</h1>
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

  if (isLoading) {
    return <PageLoader variant="tall" label="Loading your squads" />;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">
      <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface mb-2">
        Your squads
      </h1>
      <p className="text-on-surface-variant mb-6">
        Pick a squad to view its ranking board.
      </p>

      {!squads || squads.length === 0 ? (
        <div className="rounded-xl border border-gray-600 bg-surface-container p-6 text-on-surface-variant">
          {session?.user?.isSuperAdmin
            ? 'No squads have been created yet.'
            : "You're not a member of any squad yet - ask a squad admin to add you."}
        </div>
      ) : (
        <ul className="space-y-3">
          {squads.map((squad) => (
            <li key={squad.id}>
              <Link
                href={`/s/${squad.slug}`}
                className="block rounded-xl border border-gray-600 bg-surface-container p-4 font-headline font-semibold text-on-surface transition-colors hover:border-primary/40"
              >
                {squad.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {session?.user?.isSuperAdmin && (
        <div className="mt-8">
          <Link
            href="/platform/squads"
            className="font-headline text-sm font-semibold text-primary hover:text-primary-container"
          >
            Manage squads (platform admin)
          </Link>
        </div>
      )}
    </div>
  );
};

export default SquadPickerPage;
