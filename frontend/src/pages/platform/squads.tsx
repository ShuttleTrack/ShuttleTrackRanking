import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import useSWR from 'swr';
import type { Squad } from '@prisma/client';
import { PageLoader } from '@/components/common/GameLoader';
import { PlusIcon } from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Platform-superadmin only: create squads, manage each squad's admins. Not squad-scoped, so no
// SquadProvider - see lib/auth.ts's requireSuperAdmin for the equivalent API-side gate.
const PlatformSquadsPage = () => {
  const { data: squads, isLoading, mutate } = useSWR<Squad[]>('/api/squads', fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [managingSquad, setManagingSquad] = useState<Squad | null>(null);

  if (isLoading) {
    return <PageLoader variant="screen" label="Loading squads" />;
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/squads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Failed to create squad');
      }
      setName('');
      setSlug('');
      setShowCreate(false);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create squad');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Squads</h1>
            <p className="text-base-content/60">Create squads and manage their admins</p>
          </div>
          <button className="btn btn-primary w-full sm:w-auto" onClick={() => setShowCreate(true)}>
            <PlusIcon className="h-5 w-5 mr-2" />
            New Squad
          </button>
        </div>

        <div className="bg-base-100 rounded-lg shadow-lg border border-base-200">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(squads ?? []).map((squad) => (
                <tr key={squad.id} className="hover">
                  <td className="font-medium">{squad.name}</td>
                  <td>{squad.slug}</td>
                  <td>
                    <span className={`badge ${squad.enabled ? 'badge-success' : 'badge-error'}`}>
                      {squad.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <a href={`/s/${squad.slug}`} className="btn btn-ghost btn-sm">
                        View
                      </a>
                      <button className="btn btn-ghost btn-sm" onClick={() => setManagingSquad(squad)}>
                        Manage admins
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="relative rounded-xl bg-base-100 border border-base-300 p-6 w-full max-w-md shadow-xl">
              <h3 className="text-lg font-semibold mb-4">New Squad</h3>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    className="input input-bordered w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Slug</label>
                  <input
                    className="input input-bordered w-full"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="e.g. main"
                    required
                  />
                </div>
                {error && <p className="text-sm text-error">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {managingSquad && (
          <SquadAdminsModal squad={managingSquad} onClose={() => setManagingSquad(null)} />
        )}
      </div>
    </div>
  );
};

interface SquadAdminRow {
  id: number;
  email: string;
}

const SquadAdminsModal = ({ squad, onClose }: { squad: Squad; onClose: () => void }) => {
  const { data: admins, mutate } = useSWR<SquadAdminRow[]>(`/api/squads/${squad.id}/admins`, fetcher);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const response = await fetch(`/api/squads/${squad.id}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Failed to add admin');
      }
      setEmail('');
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add admin');
    }
  };

  const removeAdmin = async (adminEmail: string) => {
    await fetch(`/api/squads/${squad.id}/admins`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail }),
    });
    await mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="relative rounded-xl bg-base-100 border border-base-300 p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">{squad.name} admins</h3>
        <ul className="space-y-2 mb-4">
          {(admins ?? []).map((admin) => (
            <li key={admin.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">{admin.email}</span>
              <button className="btn btn-ghost btn-xs text-error" onClick={() => removeAdmin(admin.email)}>
                Remove
              </button>
            </li>
          ))}
          {admins?.length === 0 && <li className="text-sm text-base-content/60">No admins yet.</li>}
        </ul>
        <form onSubmit={addAdmin} className="flex gap-2">
          <input
            type="email"
            className="input input-bordered input-sm flex-1"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Add
          </button>
        </form>
        {error && <p className="text-sm text-error mt-2">{error}</p>}
        <div className="flex justify-end mt-4">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlatformSquadsPage;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user?.isSuperAdmin) {
    return { redirect: { destination: '/', permanent: false } };
  }
  return { props: {} };
};
