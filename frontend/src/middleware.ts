import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

const AUTH_ENABLED = process.env.NEXT_AUTH_ENABLED === 'true';

export default withAuth(
  function middleware(req) {
    if (!AUTH_ENABLED) {
      return NextResponse.next();
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        if (!AUTH_ENABLED) return true;
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
    },
  }
);

// Multi-squad tenancy (SQUAD_TENANCY_PLAN.md): this only covers "signed in at all" - the real
// per-squad admin/player boundary is each page's own getServerSideProps
// (resolveSquadAdminOrRedirect / resolveSquadUserOrRedirect) and each API route's
// requireSquadAdmin/requireSuperAdmin. Public boards (the squad root, encounter-history,
// game-viewer, player-ranking-history, player/*) are deliberately left out of this matcher.
export const config = {
  matcher: ['/s/:squad/admin/:path*', '/s/:squad/user/:path*', '/platform/:path*'],
};
