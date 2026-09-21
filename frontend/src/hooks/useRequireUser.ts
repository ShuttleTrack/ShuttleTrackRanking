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
      const returnPath = router.asPath || '/';
      const loginUrl =
        returnPath === '/login'
          ? '/login'
          : `/login?callbackUrl=${encodeURIComponent(returnPath)}`;
      router.push(loginUrl);
    } else if (status === 'authenticated' && !isUser) {
      router.push('/');
    }
  }, [status, isUser, router]);

  return { status, isUser };
}
