import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useAdminPlayers } from '@/hooks/useAdminPlayers';
import { capitalizeFirstLetter } from '@/utils/string';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import type { Player } from '@/types/player';
import { AddPlayerModal } from '@/components/player-management/AddPlayerModal';
import { EditPlayerModal } from '@/components/player-management/EditPlayerModal';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadAdminOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';

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
            <th>Email</th>
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
              <td>{player?.email}</td>
              <td>#{player.playerRank}</td>
              <td>{player.rankScore?.toFixed(1)}</td>
              <td>
                <span className={`badge ${
                  player.active ? 'badge-success' : 'badge-error'
                }`}>
                  {player.active ? 'Active' : 'Inactive'}
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
                {player?.email}
              </div>
              <div className="text-sm text-base-content/70 mt-1">
                Rank #{player.playerRank} • Score {player.rankScore?.toFixed(1)}
              </div>
            </div>
            <span className={`badge ${
              player.active ? 'badge-success' : 'badge-error'
            }`}>
              {player.active ? 'Active' : 'Inactive'}
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
          </div>
        </div>
      ))}
    </div>
  </div>
);

const PlayerManagementPage = () => {
  const { id: squadId } = useSquad();
  const { players: activePlayers, isLoading: activeLoading, mutate: mutateActive } = useAdminPlayers('active');
  const { players: inactivePlayers, isLoading: inactiveLoading, mutate: mutateInactive } = useAdminPlayers('inactive');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  if (activeLoading || inactiveLoading) {
    return <PageLoader variant="screen" label="Loading players" />;
  }

  const handleEditPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setShowEditModal(true);
  };

  const handleDeletePlayer = async (id: number) => {
    // Implementation coming soon
  };

  const handleAddPlayer = async (data: { name: string; email: string; initialScore: number }) => {
    try {
      const response = await fetch(`/api/squads/${squadId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add player');
      }

      // Refresh both active and inactive player lists
      await Promise.all([mutateActive(), mutateInactive()]);
    } catch (error) {
      throw error;
    }
  };

  const handleUpdatePlayer = async (playerId: number, data: { name: string; email: string }) => {
    try {
      const response = await fetch(`/api/squads/${squadId}/players/${playerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update player');
      }

      // Refresh both active and inactive player lists
      await Promise.all([mutateActive(), mutateInactive()]);
    } catch (error) {
      throw error;
    }
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
                players={activePlayers}
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

        <AddPlayerModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddPlayer}
        />

        <EditPlayerModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSubmit={handleUpdatePlayer}
          player={selectedPlayer}
        />
      </div>
    </div>
  );
};

export default PlayerManagementPage;

export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadAdminOrRedirect(context);
};
