import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import type { PlayerType } from '@prisma/client';
import { useAdminPlayers } from '@/hooks/useAdminPlayers';
import { capitalizeFirstLetter } from '@/utils/string';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import type { Player } from '@/types/player';
import { AddPlayerModal } from '@/components/player-management/AddPlayerModal';
import { EditPlayerModal } from '@/components/player-management/EditPlayerModal';
import { ReplacementOversight } from '@/components/player-management/ReplacementOversight';
import { JoinRequestOversight } from '@/components/player-management/JoinRequestOversight';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadAdminOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';
import { useSquadSettings } from '@/hooks/useSquadSettings';

// The server's derived status, rendered as-is rather than collapsed to the `active` boolean the
// list was fetched under: an ENABLED player (on the roster, yet to play their first game) is not
// the same thing as a DISABLED one, and showing both as "Inactive" hid the difference.
const statusLabel = (status: Player['status']): string =>
  status === 'ACTIVE' ? 'Active' : status === 'DISABLED' ? 'Disabled' : 'Not yet played';

const statusBadgeClass = (status: Player['status']): string =>
  status === 'ACTIVE' ? 'badge-success' : status === 'DISABLED' ? 'badge-error' : 'badge-outline';

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
            <th>Type</th>
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
              <td>
                <span className={`badge ${player.playerType === 'OPEN_SLOT' ? 'badge-secondary' : 'badge-outline'}`}>
                  {player.playerType === 'OPEN_SLOT' ? 'Open slot' : 'Fulltime'}
                </span>
              </td>
              <td>{player.rankScore === null ? '—' : `#${player.playerRank}`}</td>
              <td>
                {!player.hasScore ? (
                  <span className="text-warning font-medium">Needs a score</span>
                ) : player.rankScore === null ? (
                  '—'
                ) : (
                  player.rankScore.toFixed(1)
                )}
              </td>
              <td>
                <span className={`badge ${statusBadgeClass(player.status)}`}>{statusLabel(player.status)}</span>
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
                {!player.hasScore ? (
                  <span className="text-warning font-medium">Needs a score</span>
                ) : player.rankScore === null ? (
                  'Not ranked right now'
                ) : (
                  `Rank #${player.playerRank} • Score ${player.rankScore.toFixed(1)}`
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`badge ${statusBadgeClass(player.status)}`}>{statusLabel(player.status)}</span>
              <span className={`badge badge-sm ${player.playerType === 'OPEN_SLOT' ? 'badge-secondary' : 'badge-outline'}`}>
                {player.playerType === 'OPEN_SLOT' ? 'Open slot' : 'Fulltime'}
              </span>
            </div>
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
  const { settings, mutate: mutateSettings } = useSquadSettings();
  const { players: activePlayers, isLoading: activeLoading, mutate: mutateActive } = useAdminPlayers('active');
  const { players: inactivePlayers, isLoading: inactiveLoading, mutate: mutateInactive } = useAdminPlayers('inactive');
  // Everyone who is neither ACTIVE nor DISABLED. Without this list a freshly added player is on
  // no admin screen at all until their first game - which used to be a brief gap for a fulltime
  // player, but is the permanent resting state for a scoreless open-slot one, i.e. exactly the
  // rows that need the "needs a score" marker (OPEN_SLOT_PLAYERS_PLAN.md).
  const { players: pendingPlayers, isLoading: pendingLoading, mutate: mutatePending } = useAdminPlayers('enabled');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  if (activeLoading || inactiveLoading || pendingLoading) {
    return <PageLoader variant="screen" label="Loading players" />;
  }

  const handleEditPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setShowEditModal(true);
  };

  const handleDeletePlayer = async (id: number) => {
    // Implementation coming soon
  };

  const handleAddPlayer = async (data: { name: string; email: string; initialScore?: number; playerType: PlayerType }) => {
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
      await Promise.all([mutateActive(), mutateInactive(), mutatePending()]);
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
      await Promise.all([mutateActive(), mutateInactive(), mutatePending()]);
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

          {pendingPlayers.length > 0 && (
            <div className="bg-base-100 rounded-lg shadow-lg border border-base-200">
              <div className="p-4 border-b border-base-200">
                <h2 className="text-lg font-semibold">Not Yet Played</h2>
                <p className="text-sm text-base-content/60">
                  On the roster but yet to play a game. Open-slot players marked &quot;needs a
                  score&quot; get one the first time they&apos;re picked for a game day.
                </p>
              </div>
              <div className="p-4">
                <PlayerTable
                  players={pendingPlayers}
                  onEdit={handleEditPlayer}
                  onDelete={handleDeletePlayer}
                />
              </div>
            </div>
          )}

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

          <JoinRequestOversight
            squadId={squadId}
            fulltimePlayerCount={settings?.fulltimePlayerCount}
            maxPlayers={settings?.maxPlayers}
            onApproved={() => {
              // An approval adds a roster row, so the lists above and the cap readout both go
              // stale. Refreshing settings is what keeps the approve modal's "full-time roster
              // is full" warning honest after the approval that fills it.
              void Promise.all([mutateActive(), mutateInactive(), mutatePending(), mutateSettings()]);
            }}
          />

          <ReplacementOversight squadId={squadId} />
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
