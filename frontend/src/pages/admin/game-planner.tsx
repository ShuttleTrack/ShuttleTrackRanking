import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useGamePlayers } from '@/hooks/useGamePlayers';
import { useGame } from '@/hooks/useGame';
import { useSession } from 'next-auth/react';
import { gameService } from '@/services/gameService';
import { PlayerCard } from '@/components/game-planner/PlayerCard';
import { ActionPanel } from '@/components/game-planner/ActionPanel';
import { isValidPlayerCount } from '@/utils/game-validation';

const MAX_PLAYERS = 20;

// Deterministically distribute players into group sizes for a game day.
//
// The size *composition* (how many groups of 4 vs 5) is fixed by the player
// count, but their *order* is shuffled using a Fisher-Yates shuffle seeded by
// the caller-supplied `seed` (typically the game day's date). This means the
// larger (5-player) groups no longer always land in the lowest-ranked group,
// while still being stable for a given seed: recreating the game on the same
// day with the same player count always yields the same distribution, so the
// creator cannot re-roll for a more favourable grouping.
export const calculateGroupDistribution = (totalPlayers: number, seed: string): number[] => {
  if (totalPlayers < 4) return [];

  // Base composition of group sizes for the supported player counts.
  let distribution: number[];
  switch (totalPlayers) {
    case 4: distribution = [4]; break;
    case 5: distribution = [5]; break;
    case 8: distribution = [4, 4]; break;
    case 9: distribution = [4, 5]; break;
    case 10: distribution = [5, 5]; break;
    case 12: distribution = [4, 4, 4]; break;
    case 13: distribution = [4, 4, 5]; break;
    case 14: distribution = [4, 5, 5]; break;
    case 15: distribution = [5, 5, 5]; break;
    case 16: distribution = [4, 4, 4, 4]; break;
    case 17: distribution = [4, 4, 4, 5]; break;
    case 18: distribution = [4, 4, 5, 5]; break;
    case 19: distribution = [4, 5, 5, 5]; break;
    case 20: distribution = [5, 5, 5, 5]; break;
    default: {
      // Fallback for any unexpected count (shouldn't happen due to validation).
      const numGroups = Math.ceil(totalPlayers / 5);
      const minPlayersPerGroup = 4;
      distribution = new Array(numGroups).fill(minPlayersPerGroup);

      let remaining = totalPlayers - numGroups * minPlayersPerGroup;
      let groupIndex = numGroups - 1; // Start from last group
      while (remaining > 0) {
        distribution[groupIndex] += 1;
        remaining -= 1;
        groupIndex = (groupIndex - 1 + numGroups) % numGroups; // wrap around
      }
    }
  }

  // Hash the seed string into a 32-bit unsigned int.
  const hashSeed = (str: string): number => {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  };

  // mulberry32: small, fast seeded PRNG returning values in [0, 1).
  const mulberry32 = (a: number): (() => number) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Seeded Fisher-Yates shuffle of the group sizes.
  const rng = mulberry32(hashSeed(seed));
  for (let i = distribution.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
  }

  return distribution;
};

const GamePlannerPage = () => {
  const router = useRouter();
  const { players, isLoading: playersLoading } = useGamePlayers();
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const { data: session, status } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const gameId = router.query.gameId as string;
  const { game, isLoading: gameLoading } = useGame(gameId as string);

  // Load existing game data if editing
  useEffect(() => {
    if (game) {
      setIsEditing(true);
      const selectedIds = Object.values(game.groups as Record<string, number[]>)
        .flat()
        .filter((id, index, self) => self.indexOf(id) === index);
      setSelectedPlayers(selectedIds);
    }
  }, [game]);

  React.useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  const handlePlayerToggle = (playerId: number) => {
    setSelectedPlayers(current => {
      if (current.includes(playerId)) {
        return current.filter(id => id !== playerId);
      }
      if (current.length >= MAX_PLAYERS) {
        return current;
      }
      return [...current, playerId];
    });
  };

  const getValidationMessage = (count: number) => {
    if (count < 4) return 'Select at least 4 players';
    if (count > MAX_PLAYERS) return 'Maximum 20 players allowed';
    if (!isValidPlayerCount(count)) return 'Player count must allow for groups of 4-5 players';
    return '';
  };

  const handleCreateGameDay = async () => {
    // Get selected players with their details
    const selectedPlayerDetails = players
      .filter(p => selectedPlayers.includes(p.id))
      .sort((a, b) => a.playerRank - b.playerRank);

    const totalPlayers = selectedPlayerDetails.length;

    // Use the local calendar date as a deterministic seed so the group-size
    // ordering is fixed for the day but varies day to day. Folding in the
    // player count keeps different counts decorrelated.
    const today = new Date();
    const dateSeed = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

    // Calculate number of groups and distribution
    const distribution = calculateGroupDistribution(totalPlayers, `${dateSeed}:${totalPlayers}`);
    const groups: Record<string, number[]> = {};
    
    let playerIndex = 0;
    distribution.forEach((groupSize, index) => {
      groups[`Group ${index + 1}`] = selectedPlayerDetails
        .slice(playerIndex, playerIndex + groupSize)
        .map(p => p.id);
      playerIndex += groupSize;
    });

    try {
      const gameData = {
        groups,
        scores: {},
        status: 'DRAFT' as const
      };

      if (isEditing && gameId) {
        await gameService.updateGame(gameId, gameData);
        router.push(`/admin/game-day?gameId=${gameId}`);
      } else {
        const newGame = await gameService.createGame(gameData);
        router.push(`/admin/game-day?gameId=${newGame.id}`);
      }
    } catch (error) {
      console.error('Failed to create/update game:', error);
      // Show error toast/notification
    }
  };

  const validationMessage = getValidationMessage(selectedPlayers.length);
  const isValid = !validationMessage;

  return (
    <div className="container mx-auto p-4 pb-32 md:pb-4">
      <div className="mb-6 sm:mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent">
          {isEditing ? 'Edit Game Day' : 'Game Planner'}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          {isEditing 
            ? 'Modify player selection for the game day'
            : 'Select players for the game day (maximum 20)'}
        </p>
      </div>

      <div className="bg-base-100 rounded-lg shadow-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {players
            .sort((a, b) => a.playerRank - b.playerRank)
            .map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                isSelected={selectedPlayers.includes(player.id)}
                onToggle={handlePlayerToggle}
              />
            ))}
        </div>
      </div>

      <ActionPanel
        selectedCount={selectedPlayers.length}
        maxPlayers={MAX_PLAYERS}
        isEditing={isEditing}
        validationMessage={validationMessage}
        isValid={isValid}
        onCreateGame={handleCreateGameDay}
        isMobile={true}
      />

      <ActionPanel
        selectedCount={selectedPlayers.length}
        maxPlayers={MAX_PLAYERS}
        isEditing={isEditing}
        validationMessage={validationMessage}
        isValid={isValid}
        onCreateGame={handleCreateGameDay}
      />
    </div>
  );
};

export default GamePlannerPage; 