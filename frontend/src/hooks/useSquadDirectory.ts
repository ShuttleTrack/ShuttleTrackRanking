import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import type { DirectorySquad } from '@/lib/squadDirectory';
import type { MyJoinRequest } from '@/lib/joinRequests';

// Backs /squads/browse (SELF_REGISTRATION_PLAN.md). Two hooks rather than one because they
// answer different questions and one of them deliberately survives the other's filter: the
// directory only lists enabled && openForOpenSlot squads, so a request pending on a squad that
// has since closed would vanish if "my requests" were derived from it.

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Request failed');
  }
  return res.json();
};

export function useOpenSquads() {
  const { status } = useSession();
  const { data, error, isLoading, mutate } = useSWR<DirectorySquad[]>(
    status === 'authenticated' ? '/api/squads/open' : null,
    fetcher
  );

  return { squads: data ?? [], isLoading: status === 'loading' || isLoading, error, mutate };
}

export function useMyJoinRequests() {
  const { status } = useSession();
  const { data, error, isLoading, mutate } = useSWR<MyJoinRequest[]>(
    status === 'authenticated' ? '/api/squads/join-requests' : null,
    fetcher
  );

  return { requests: data ?? [], isLoading: status === 'loading' || isLoading, error, mutate };
}
