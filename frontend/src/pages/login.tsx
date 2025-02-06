import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { LoadingSpinner } from '@/components/auth/LoadingSpinner';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

const LoginPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (session) {
      router.push('/');
    }
  }, [session, router]);

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  const handleSignIn = () => {
    signIn('google', { callbackUrl: '/' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold">Welcome Back</h2>
          <p className="mt-2 text-sm text-base-content/60">
            Sign in to access your account
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <GoogleSignInButton onSignIn={handleSignIn} />
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 