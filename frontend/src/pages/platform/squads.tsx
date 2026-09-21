import { useState, type FormEvent, type ReactNode } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import useSWR from 'swr';
import type { Squad } from '@prisma/client';
import { PageLoader } from '@/components/common/GameLoader';
import { PlusIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/leaderboard/PageHeader';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const cardClass = 'rounded-xl bg-surface-container/90 border border-gray-600 p-4 sm:p-6';
const inputFieldClass =
  'w-full rounded-xl border border-gray-600 bg-surface-container px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';
const primaryBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const outlineBtn =
  'inline-flex min-h-[40px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 px-4 py-2 font-medium text-on-surface transition-colors hover:border-primary/40 disabled:opacity-50';
const modalPanelClass =
  'relative w-full max-w-md rounded-xl border border-white/10 bg-surface-container-high p-6 shadow-xl';

function ModalShell({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className={modalPanelClass} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const PlatformSquadsPage = () => {
  const { data: squads, isLoading, mutate } = useSWR<Squad[]>('/api/squads', fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [managingSquad, setManagingSquad] = useState<Squad | null>(null);
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null);

  if (isLoading) {
    return <PageLoader variant="screen" label="Loading squads" />;
  }

  const handleCreate = async (e: FormEvent) => {
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
    <div className="min-h-screen pb-12">
      <PageHeader
        title="Squads"
        subtitle="Create squads and manage their admins."
        className="!mb-6"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row justify-end mb-6">
          <button type="button" className={primaryBtn} onClick={() => setShowCreate(true)}>
            <PlusIcon className="h-5 w-5 mr-2" aria-hidden />
            New Squad
          </button>
        </div>

        <ul className="space-y-3">
          {(squads ?? []).map((squad) => (
            <li key={squad.id} className={cardClass}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-headline text-lg font-semibold text-on-surface truncate">
                    {squad.name}
                  </p>
                  <p className="font-label text-xs uppercase tracking-wider text-on-surface-variant">
                    Slug: {squad.slug}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span
                      className={
                        squad.enabled
                          ? 'inline-flex rounded-lg bg-primary/15 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-primary'
                          : 'inline-flex rounded-lg border border-white/10 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant'
                      }
                    >
                      {squad.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="text-sm text-on-surface-variant">
                      Max players: {squad.maxPlayers ?? 'Unlimited'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/s/${squad.slug}`} className={outlineBtn}>
                    View
                  </Link>
                  <button type="button" className={outlineBtn} onClick={() => setEditingSquad(squad)}>
                    Edit
                  </button>
                  <button type="button" className={outlineBtn} onClick={() => setManagingSquad(squad)}>
                    Manage admins
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {showCreate && (
          <ModalShell onClose={() => setShowCreate(false)}>
            <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">New Squad</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Name</label>
                <input
                  className={inputFieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Slug</label>
                <input
                  className={inputFieldClass}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. main"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className={outlineBtn} onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className={primaryBtn} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </ModalShell>
        )}

        {managingSquad && (
          <SquadAdminsModal squad={managingSquad} onClose={() => setManagingSquad(null)} />
        )}

        {editingSquad && (
          <SquadSettingsModal
            squad={editingSquad}
            onClose={() => setEditingSquad(null)}
            onSaved={async () => {
              setEditingSquad(null);
              await mutate();
            }}
          />
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

  const addAdmin = async (e: FormEvent) => {
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
    <ModalShell onClose={onClose}>
      <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">{squad.name} admins</h3>
      <ul className="space-y-2 mb-4">
        {(admins ?? []).map((admin) => (
          <li key={admin.id} className="flex items-center justify-between gap-2">
            <span className="text-sm text-on-surface truncate">{admin.email}</span>
            <button
              type="button"
              className="text-sm font-medium text-red-400 hover:text-red-300 shrink-0"
              onClick={() => removeAdmin(admin.email)}
            >
              Remove
            </button>
          </li>
        ))}
        {admins?.length === 0 && (
          <li className="text-sm text-on-surface-variant">No admins yet.</li>
        )}
      </ul>
      <form onSubmit={addAdmin} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          className={inputFieldClass}
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className={primaryBtn}>
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      <div className="flex justify-end mt-4">
        <button type="button" className={outlineBtn} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
};

const SquadSettingsModal = ({
  squad,
  onClose,
  onSaved,
}: {
  squad: Squad;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [enabled, setEnabled] = useState(squad.enabled);
  const [maxPlayers, setMaxPlayers] = useState(squad.maxPlayers?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/squads/${squad.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          maxPlayers: maxPlayers.trim() === '' ? null : Number(maxPlayers),
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Failed to update squad');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update squad');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">{squad.name} settings</h3>
      <form onSubmit={handleSave} className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm font-medium text-on-surface">
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Max players</label>
          <input
            type="number"
            min={1}
            className={inputFieldClass}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(e.target.value)}
            placeholder="Leave blank for unlimited"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={outlineBtn} onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </ModalShell>
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
