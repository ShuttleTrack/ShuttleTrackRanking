import { useRouter } from 'next/router';
import { useEffect } from 'react';

const UserManagementRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/user/profile');
  }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div
        className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
};

export default UserManagementRedirect;
