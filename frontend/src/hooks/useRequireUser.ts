import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function useRequireUser() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      const returnPath = router.asPath || '/';
      const loginUrl =
        returnPath === '/login'
          ? '/login'
          : `/login?callbackUrl=${encodeURIComponent(returnPath)}`;
      router.push(loginUrl);
    } else if (session?.user && !session.user.accessLevel?.includes('USER')) {
      router.push('/');
    }
  }, [status, session, router]);

  const isUser = Boolean(session?.user?.accessLevel?.includes('USER'));

  return { session, status, isUser };
}
