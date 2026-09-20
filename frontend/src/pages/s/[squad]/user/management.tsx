import { useRouter } from 'next/router';
import { useEffect } from 'react';
import type { GetServerSideProps } from 'next';
import { PageLoader } from '@/components/common/GameLoader';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';
import { resolveSquadOrNotFound } from '@/lib/squadPage';

const UserManagementRedirect = () => {
  const router = useRouter();
  const { slug } = useSquad();

  useEffect(() => {
    router.replace(`/s/${slug}/user/profile`);
  }, [router, slug]);

  return <PageLoader variant="tall" label="Loading" />;
};

export default UserManagementRedirect;

export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadOrNotFound(context);
};
