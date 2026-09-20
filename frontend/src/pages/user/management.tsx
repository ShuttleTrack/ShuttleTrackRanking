import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { PageLoader } from '@/components/common/GameLoader';

const UserManagementRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/user/profile');
  }, [router]);

  return <PageLoader variant="tall" label="Loading" />;
};

export default UserManagementRedirect;
