import React from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import type { GetServerSideProps } from 'next';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import prisma from '@/lib/prisma';
import { getSquadsForEmail } from '@/lib/auth/squadAccess';
import PageHeader from '@/components/leaderboard/PageHeader';

interface SquadOption {
  id: number;
  name: string;
  slug: string;
}

interface SquadPickerPageProps {
  squads?: SquadOption[];
  isSuperAdmin?: boolean;
}

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
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
    <div className="min-h-screen pb-12">
      <PageHeader title="Your squads" subtitle="Pick a squad to view its ranking board." />
      <div className="max-w-2xl mx-auto px-4 sm:px-8">
        {squads.length === 0 ? (
          <div className="rounded-xl border border-gray-600 bg-surface-container/90 p-6">
            <p className="text-on-surface-variant">
              {isSuperAdmin
                ? 'No squads have been created yet.'
                : "You're not a member of any squad yet."}
            </p>
            {!isSuperAdmin && (
              <Link href="/squads/browse" className="btn btn-primary btn-sm mt-4">
                Find a squad
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {squads.map((squad) => (
              <li key={squad.id}>
                <Link
                  href={`/s/${squad.slug}`}
                  className="flex min-h-[52px] items-center gap-3 rounded-xl border border-gray-600 bg-surface-container/90 px-4 py-3 font-headline font-semibold text-on-surface transition-colors hover:border-primary/40"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] font-headline text-xs font-bold text-on-surface-variant"
                    aria-hidden
                  >
                    {monogram(squad.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{squad.name}</span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-on-surface-variant" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {squads.length > 0 && (
          <div className="mt-6">
            <Link
              href="/squads/browse"
              className="font-headline text-sm font-semibold text-primary hover:text-primary-container"
            >
              Find another squad
            </Link>
          </div>
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
    </div>
  );
};

export default SquadPickerPage;

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
