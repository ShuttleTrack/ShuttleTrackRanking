import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useMemo } from 'react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { LoadingSpinner } from '@/components/auth/LoadingSpinner';
import { getLoginErrorMessage, safeCallbackUrl } from '@/utils/loginAuth';

function LoginRacketMark() {
  return (
    <div
      className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary"
      aria-hidden
    >
      <svg
        className="h-10 w-10"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="32" cy="22" rx="14" ry="18" strokeWidth="2.2" />
        <line x1="26" y1="14" x2="38" y2="14" strokeWidth="1.2" opacity="0.7" />
        <line x1="24" y1="22" x2="40" y2="22" strokeWidth="1.2" opacity="0.7" />
        <line x1="26" y1="30" x2="38" y2="30" strokeWidth="1.2" opacity="0.7" />
        <line x1="32" y1="40" x2="32" y2="52" strokeWidth="2.4" />
        <rect x="28" y="52" width="8" height="10" rx="1.5" strokeWidth="2" />
      </svg>
    </div>
  );
}

const LoginPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();

  const callbackUrl = useMemo(
    () => safeCallbackUrl(router.query.callbackUrl),
    [router.query.callbackUrl]
  );

  const errorMessage = useMemo(
    () => getLoginErrorMessage(router.query.error),
    [router.query.error]
  );

  useEffect(() => {
    if (session) {
      router.replace(callbackUrl);
    }
  }, [session, router, callbackUrl]);

  if (status === 'loading' || session) {
    return <LoadingSpinner />;
  }

  const handleSignIn = () => {
    signIn('google', { callbackUrl });
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-10">
      <div className="relative max-w-md w-full overflow-hidden rounded-xl border border-white/5 bg-surface-container/55 backdrop-blur-sm">
        <div className="h-0.5 w-full kinetic-gradient" aria-hidden />
        <div className="px-6 py-8 sm:px-8 sm:py-10">
          <div className="flex justify-center">
            <LoginRacketMark />
          </div>

          <div className="mt-6 text-center">
            <p className="font-label text-[10px] font-bold uppercase tracking-widest text-primary">
              Club access
            </p>
            <h1
              className="mt-2 font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-balance text-on-surface"
            >
              Ready for the next rally?
            </h1>
            <div className="mx-auto mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
          </div>

          {errorMessage ? (
            <div
              className="mt-6 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-8">
            <GoogleSignInButton onSignIn={handleSignIn} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
