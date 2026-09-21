import type { GetServerSidePropsContext } from 'next';
import { getServerSession } from 'next-auth/next';
import type { Session } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import prisma from '@/lib/prisma';
import { getSquadAccess, type SquadAccess } from '@/lib/auth/squadAccess';
import type { SquadSummary } from '@/contexts/SquadContext';

interface Resolved {
  squad: SquadSummary;
  session: Session | null;
  access: SquadAccess;
}

// Resolves the squad by slug and, if there's a session, this email's standing in it - shared by
// every getServerSideProps below so each only differs in what it requires.
async function resolveSquadAndAccess(
  context: GetServerSidePropsContext
): Promise<{ notFound: true } | Resolved> {
  const slug = context.params?.squad;
  if (typeof slug !== 'string') {
    return { notFound: true };
  }

  const squadRow = await prisma.squad.findUnique({ where: { slug } });
  if (!squadRow || !squadRow.enabled) {
    return { notFound: true };
  }

  const session = await getServerSession(context.req, context.res, authOptions);
  const access: SquadAccess =
    session?.user?.email
      ? await getSquadAccess(session.user.email, squadRow.id)
      : { isSquadAdmin: false, player: null };

  const isSuperAdmin = Boolean(session?.user?.isSuperAdmin);
  const squad: SquadSummary = {
    id: squadRow.id,
    slug: squadRow.slug,
    name: squadRow.name,
    isSquadAdmin: access.isSquadAdmin || isSuperAdmin,
    isPlayerHere: access.player !== null,
  };

  return { squad, session, access };
}

// Shared getServerSideProps step for every public, no-login page under pages/s/[squad]/**:
// resolve the Squad by its slug, 404 on a missing/disabled squad, and hand back the { squad }
// prop that _app.tsx looks for to set up SquadContext for the whole page tree (including the
// global nav in Layout). Also resolves the viewer's squad-admin/player status when they happen
// to be signed in, purely so nav links can reflect it - nothing here requires a session.
export async function resolveSquadOrNotFound(
  context: GetServerSidePropsContext
): Promise<{ notFound: true } | { props: { squad: SquadSummary } }> {
  const result = await resolveSquadAndAccess(context);
  if ('notFound' in result) return result;
  return { props: { squad: result.squad } };
}

// Shared getServerSideProps step for every admin page under pages/s/[squad]/admin/**: resolve
// the squad, require a signed-in session, and require squad-admin rights (a platform superadmin
// passes too). This is the real access boundary, same as requireSquadAdmin is for API routes -
// middleware.ts's redirect-to-login only covers "signed in at all".
export async function resolveSquadAdminOrRedirect(
  context: GetServerSidePropsContext
): Promise<
  | { notFound: true }
  | { redirect: { destination: string; permanent: false } }
  | { props: { squad: SquadSummary } }
> {
  const result = await resolveSquadAndAccess(context);
  if ('notFound' in result) return result;

  if (!result.session?.user?.email) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  if (!result.squad.isSquadAdmin) {
    return { redirect: { destination: `/s/${result.squad.slug}`, permanent: false } };
  }

  return { props: { squad: result.squad } };
}

// Shared getServerSideProps step for every authenticated player-facing page under
// pages/s/[squad]/user/**: resolve the squad, require a signed-in session, and require this
// email to be a registered Player in this squad (a platform superadmin passes too, but has no
// player row - pages under user/ that need a playerId handle that case themselves).
export async function resolveSquadUserOrRedirect(
  context: GetServerSidePropsContext
): Promise<
  | { notFound: true }
  | { redirect: { destination: string; permanent: false } }
  | { props: { squad: SquadSummary; playerId: number | null } }
> {
  const result = await resolveSquadAndAccess(context);
  if ('notFound' in result) return result;

  if (!result.session?.user?.email) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  if (!result.access.player && !result.session.user.isSuperAdmin) {
    return { redirect: { destination: `/s/${result.squad.slug}`, permanent: false } };
  }

  return { props: { squad: result.squad, playerId: result.access.player?.id ?? null } };
}
