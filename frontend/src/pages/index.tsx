import React from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import type { GetServerSideProps } from 'next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import prisma from '@/lib/prisma';
import { getSquadsForEmail } from '@/lib/auth/squadAccess';

interface SquadOption {
  id: number;
  name: string;
  slug: string;
}

interface SquadPickerPageProps {
  // Absent entirely for a signed-out visitor - the page shows a sign-in prompt instead. Present
  // (possibly empty) once signed in; getServerSideProps below already redirects straight to
  // /s/{slug} when there's exactly one, so by the time this renders with squads.length > 1 (or
  // 0), there was a genuine choice - or lack of one - to show.
  squads?: SquadOption[];
  isSuperAdmin?: boolean;
}

const SquadPickerPage = ({ squads, isSuperAdmin }: SquadPickerPageProps) => {
  if (!squads) {
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

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">
      <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface mb-2">
        Your squads
      </h1>
      <p className="text-on-surface-variant mb-6">
        Pick a squad to view its ranking board.
      </p>

      {squads.length === 0 ? (
        <div className="rounded-xl border border-gray-600 bg-surface-container p-6 text-on-surface-variant">
          {isSuperAdmin
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

      {isSuperAdmin && (
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

// Resolved server-side (rather than the client fetching /api/squads after mount) specifically so
// the exactly-one-squad case can redirect before anything renders - no flash of a picker with a
// single, pointless option.
export const getServerSideProps: GetServerSideProps<SquadPickerPageProps> = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user?.email) {
    return { props: {} };
  }

  const squadRows = session.user.isSuperAdmin
    ? await prisma.squad.findMany({ orderBy: { name: 'asc' } })
    : await getSquadsForEmail(session.user.email);

  if (squadRows.length === 1) {
    return { redirect: { destination: `/s/${squadRows[0].slug}`, permanent: false } };
  }

  return {
    props: {
      squads: squadRows.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
      isSuperAdmin: Boolean(session.user.isSuperAdmin),
    },
  };
};
