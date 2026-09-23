import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

// Multi-squad tenancy (SQUAD_TENANCY_PLAN.md): "is a user (of this squad)" is no longer on the
// session - it's resolved server-side per squad (getSquadAccess) and passed in as a prop from
// the page's getServerSideProps.
export function useRequireUser(isUser: boolean) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      // Client-side session expiry: come back here after signing in. The first-load case (a
      // signed-out request) is handled server-side by squadPage.ts's loginRedirectFor.
      const returnPath = router.asPath || '/';
      router.push(returnPath === '/' || returnPath.startsWith('/login') ? '/login' : `/login?callbackUrl=${encodeURIComponent(returnPath)}`);
    } else if (status === 'authenticated' && !isUser) {
      router.push('/');
    }
  }, [status, isUser, router]);

  return { status, isUser };
}
