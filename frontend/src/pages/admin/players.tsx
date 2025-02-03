import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { usePlayers } from '@/hooks/usePlayers';
import { useInactivePlayers } from '@/hooks/useInactivePlayers';
import { capitalizeFirstLetter } from '@/utils/string';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { Player } from '@/types/player';

const PlayerTable = ({ players, onEdit, onDelete }: {
  players: Player[];
  onEdit: (player: Player) => void;
  onDelete: (id: number) => void;
}) => (
  <div className="overflow-hidden">
    {/* Desktop Table - Hidden on mobile */}
    <div className="hidden md:block">
      <table className="table w-full">
        <thead>
          <tr>
            <th>Name</th>
            <th>Rank</th>
            <th>Score</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.id} className="hover">
              <td className="font-medium">
                {capitalizeFirstLetter(player.name)}
              </td>
              <td>#{player.playerRank}</td>
              <td>{player.rankScore.toFixed(1)}</td>
              <td>
                <span className={`badge ${
                  player.isActive ? 'badge-success' : 'badge-error'
                }`}>
                  {player.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onEdit(player)}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm text-error"
                    onClick={() => onDelete(player.id)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Mobile Cards - Shown only on mobile */}
    <div className="md:hidden space-y-4">
      {players.map((player) => (
        <div 
          key={player.id} 
          className="bg-base-200/50 p-4 rounded-lg space-y-3"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium">
                {capitalizeFirstLetter(player.name)}
              </h3>
              <div className="text-sm text-base-content/70 mt-1">
                Rank #{player.playerRank} • Score {player.rankScore.toFixed(1)}
              </div>
            </div>
            <span className={`badge ${
              player.isActive ? 'badge-success' : 'badge-error'
            }`}>
              {player.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          
          <div className="flex justify-end gap-2 pt-2 border-t border-base-300">
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => onEdit(player)}
            >
              <PencilIcon className="h-4 w-4" />
              <span className="ml-1">Edit</span>
            </button>
            <button
              className="btn btn-sm btn-ghost text-error"
              onClick={() => onDelete(player.id)}
            >
              <TrashIcon className="h-4 w-4" />
              <span className="ml-1">Delete</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const PlayerManagementPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { players, isLoading: activeLoading, mutate: mutateActive } = usePlayers();
  const { inactivePlayers, isLoading: inactiveLoading, mutate: mutateInactive } = useInactivePlayers();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth check
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login');
    }
  }, [status, router]);

  if (status === 'loading' || activeLoading || inactiveLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  if (!session?.user?.isAdmin) return null;

  const handleEditPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setShowEditModal(true);
  };

  const handleDeletePlayer = async (id: number) => {
    // Implementation coming soon
  };

  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header with responsive padding */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Player Management</h1>
            <p className="text-base-content/60">Manage player profiles and rankings</p>
          </div>
          <button
            className="btn btn-primary w-full sm:w-auto"
            onClick={() => setShowAddModal(true)}
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Player
          </button>
        </div>

        {/* Player sections with improved spacing */}
        <div className="space-y-6">
          <div className="bg-base-100 rounded-lg shadow-lg border border-base-200">
            <div className="p-4 border-b border-base-200">
              <h2 className="text-lg font-semibold">Active Players</h2>
              <p className="text-sm text-base-content/60">Players currently participating in games</p>
            </div>
            <div className="p-4">
              <PlayerTable 
                players={players}
                onEdit={handleEditPlayer}
                onDelete={handleDeletePlayer}
              />
            </div>
          </div>

          <div className="bg-base-100 rounded-lg shadow-lg border border-base-200">
            <div className="p-4 border-b border-base-200">
              <h2 className="text-lg font-semibold">Inactive Players</h2>
              <p className="text-sm text-base-content/60">Players currently not participating in games</p>
            </div>
            <div className="p-4">
              <PlayerTable 
                players={inactivePlayers}
                onEdit={handleEditPlayer}
                onDelete={handleDeletePlayer}
              />
            </div>
          </div>
        </div>

        {/* Add/Edit Modals will be added here */}
      </div>
    </div>
  );
};

export default PlayerManagementPage; 