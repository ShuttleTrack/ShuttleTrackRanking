import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { useGamePlayers, type GamePlannerPlayer } from '@/hooks/useGamePlayers';
import { useGame } from '@/hooks/useGame';
import { gameService } from '@/services/gameService';
import { PlayerCard } from '@/components/game-planner/PlayerCard';
import { ActionPanel } from '@/components/game-planner/ActionPanel';
import { BulkScorePanel } from '@/components/game-planner/BulkScorePanel';
import { AttendanceBanner } from '@/components/game-planner/AttendanceBanner';
import { useTodaysAttendance } from '@/hooks/useTodaysAttendance';
import { isValidPlayerCount } from '@/utils/game-validation';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadAdminOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';

const MAX_PLAYERS = 20;

// Distribute players into group sizes for a game day.
//
// The size *composition* (how many groups of 4 vs 5) is fixed by the player
// count, but their *order* is randomly shuffled (Fisher-Yates) on every call, so
// the larger (5-player) groups don't always land in the lowest-ranked group.
// `rng` is injectable for tests; it defaults to Math.random.
export const calculateGroupDistribution = (totalPlayers: number, rng: () => number = Math.random): number[] => {
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

  // Fisher-Yates shuffle of the group sizes.
  for (let i = distribution.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
  }

  return distribution;
};

// OPEN_SLOT_PLAYERS_PLAN.md "Game-planner player selection UI": FULLTIME players plus any
// OPEN_SLOT player currently covering an active replacement belong with the regular roster for
// selection purposes; plain open-slot players (no active replacement today) are a separate pool.
// What Player.rankScore defaulted to before OPEN_SLOT_PLAYERS_PLAN.md made the column nullable.
const DEFAULT_STARTING_RANK_SCORE = 1000;

// Compared against the string literal rather than Prisma's PlayerType object on purpose: a
// *value* import from '@prisma/client' in a client-rendered page pulls its browser runtime -
// every model name and field enum - into that page's JS bundle. Type-only imports are erased by
// the compiler, so `import type { PlayerType }` stays fine (see types/player.ts).
const isFulltimeRosterForToday = (player: GamePlannerPlayer): boolean =>
  player.playerType === 'FULLTIME' || player.isActiveReplacement;

const GamePlannerPage = () => {
  const router = useRouter();
  const { id: squadId, slug } = useSquad();
  const { players, isLoading: playersLoading, refresh } = useGamePlayers();
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [scorelessSelection, setScorelessSelection] = useState<GamePlannerPlayer[] | null>(null);
  const [createError, setCreateError] = useState('');
  const gameId = router.query.gameId as string;
  const { game, isLoading: gameLoading } = useGame(gameId as string);
  // ATTENDANCE_VOTE_PLAN.md: once today's check-in vote has closed, a NEW game day opens with the
  // confirmed players pre-ticked. Only a seed - the admin can still change anything, and group
  // distribution, rank-order slicing and the scoreless gate below are all unchanged. Never on the
  // edit path, which keeps the selection the existing game already has.
  const { attendance, isLoading: attendanceLoading, releaseSlot } = useTodaysAttendance(!gameId);
  const [seededFromGameDayId, setSeededFromGameDayId] = useState<number | null>(null);
  const [releasing, setReleasing] = useState(false);

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

  useEffect(() => {
    if (gameId || !attendance || players.length === 0 || seededFromGameDayId === attendance.gameDayId) return;
    // Filtered through today's roster: a confirmed id the planner cannot offer (disabled since)
    // is dropped here and counted in the banner, rather than silently selected.
    const available = new Set(players.map((p) => p.id));
    setSelectedPlayers(attendance.confirmed.map((p) => p.id).filter((id) => available.has(id)).slice(0, MAX_PLAYERS));
    setSeededFromGameDayId(attendance.gameDayId);
  }, [gameId, attendance, players, seededFromGameDayId]);

  const isGameLoadPending = Boolean(gameId) && gameLoading;

  if (playersLoading || isGameLoadPending || attendanceLoading) {
    return <PageLoader variant="compact" label="Loading game planner" />;
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

  // Throws on failure so callers that chain off it (the bulk-assign panel's "Assign & continue")
  // can surface the reason - the server-side scoreless gate in POST/PUT /games returns a 400
  // naming the players, which used to be swallowed into console.error and left the admin
  // staring at an unchanged screen.
  const createGameDayFor = async (selectedPlayerDetails: GamePlannerPlayer[]) => {
    const totalPlayers = selectedPlayerDetails.length;

    // Calculate number of groups and distribution
    const distribution = calculateGroupDistribution(totalPlayers);
    const groups: Record<string, number[]> = {};

    let playerIndex = 0;
    distribution.forEach((groupSize, index) => {
      groups[`Group ${index + 1}`] = selectedPlayerDetails
        .slice(playerIndex, playerIndex + groupSize)
        .map(p => p.id);
      playerIndex += groupSize;
    });

    const gameData = {
      groups,
      scores: {},
      status: 'DRAFT' as const
    };

    if (isEditing && gameId) {
      await gameService.updateGame(squadId, gameId, gameData);
      router.push(`/s/${slug}/admin/game-day?gameId=${gameId}`);
    } else {
      // Links the throwaway Game back to the attendance that produced it; a second create for the
      // same game day is refused server-side with a 400 naming the existing game.
      const newGame = await gameService.createGame(squadId, {
        ...gameData,
        gameDayId: attendance && !attendance.gameId ? attendance.gameDayId : undefined,
      });
      router.push(`/s/${slug}/admin/game-day?gameId=${newGame.id}`);
    }
  };

  const handleCreateGameDay = async () => {
    setCreateError('');
    const selectedPlayerDetails = players
      .filter(p => selectedPlayers.includes(p.id))
      .sort((a, b) => a.playerRank - b.playerRank);

    // OPEN_SLOT_PLAYERS_PLAN.md "Bulk initial rank-score assignment": block on any selected
    // player without a score rather than letting the server-side game-create gate reject the
    // whole request after the fact.
    const scoreless = selectedPlayerDetails.filter(p => !p.hasScore);
    if (scoreless.length > 0) {
      setScorelessSelection(scoreless);
      return;
    }

    try {
      await createGameDayFor(selectedPlayerDetails);
    } catch (error) {
      console.error('Failed to create/update game:', error);
      setCreateError(error instanceof Error ? error.message : 'Failed to create the game day');
    }
  };

  // OPEN_SLOT_PLAYERS_PLAN.md: "once the bulk action succeeds, handleCreateGameDay re-runs with
  // all selected players now scored and proceeds exactly as today". The re-run has to work off
  // the *refreshed* list, not the one captured when the panel opened: assigning a score changes
  // the newly-scored player's game-day rank (they no longer sort last), and the planner slices
  // that rank order into skill tiers, so reusing the stale order would drop them into the bottom
  // group whatever score the admin just gave them.
  const handleBulkScoreSubmit = async (assignments: { playerId: number; rankScore: number }[]) => {
    const res = await fetch(`/api/squads/${squadId}/players/bulk-initial-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Failed to assign scores');
    }

    const refreshedPlayers = await refresh();
    const refreshedSelection = refreshedPlayers
      .filter(p => selectedPlayers.includes(p.id))
      .sort((a, b) => a.playerRank - b.playerRank);

    // Thrown rather than reopening the panel: a second pass would assign the same scores again
    // and land right back here, so surface it in the panel the admin is already looking at.
    if (refreshedSelection.length !== selectedPlayers.length || refreshedSelection.some(p => !p.hasScore)) {
      throw new Error('Scores were saved, but the roster came back inconsistent - reload the page and try again.');
    }

    setScorelessSelection(null);
    await createGameDayFor(refreshedSelection);
  };

  // Suggested default for the bulk-assign panel: the squad's current minimum ACTIVE rank score -
  // the same quantity scorePersister.ts's activatePlayer computes as currentMinActiveRankScore
  // and feeds to activation.ts, so a first-timer enters at the bottom of the ladder rather than
  // mid-table (OPEN_SLOT_PLAYERS_PLAN.md). Only ACTIVE players count: a not-yet-played or
  // disabled player's score isn't part of the live ladder.
  const suggestedScore = (() => {
    const activeScores = players
      .filter(p => p.status === 'ACTIVE' && typeof p.rankScore === 'number')
      .map(p => p.rankScore as number);
    // A squad whose ladder is empty (every player is a first-timer) has no minimum to sit below,
    // so fall back to the same starting score the schema defaulted rankScore to before it
    // became nullable.
    return activeScores.length === 0 ? DEFAULT_STARTING_RANK_SCORE : Math.min(...activeScores);
  })();

  const handleReleaseSlot = async (playerId: number) => {
    setReleasing(true);
    setCreateError('');
    try {
      await releaseSlot(playerId);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to release the slot');
    } finally {
      setReleasing(false);
    }
  };

  const availableIds = new Set(players.map((p) => p.id));
  const preTickedCount = attendance ? attendance.confirmed.filter((p) => availableIds.has(p.id)).length : 0;

  const validationMessage = getValidationMessage(selectedPlayers.length);
  const isValid = !validationMessage;

  const fulltimeRoster = players.filter(isFulltimeRosterForToday).sort((a, b) => a.playerRank - b.playerRank);
  const openSlotRoster = players.filter(p => !isFulltimeRosterForToday(p)).sort((a, b) => a.playerRank - b.playerRank);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-32 md:pb-8">
      <section className="mb-6 sm:mb-8">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          {isEditing ? 'Edit Game Day' : 'Game Planner'}
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
        {!isEditing && (
          <p className="text-on-surface-variant font-medium text-sm sm:text-base mt-2">
            Select players for the game day (maximum 20)
          </p>
        )}
      </section>

      {!isEditing && attendance && (
        <AttendanceBanner
          attendance={attendance}
          preTickedCount={preTickedCount}
          onReleaseSlot={handleReleaseSlot}
          releasing={releasing}
        />
      )}

      <section className="mb-6">
        <h2 className="font-headline text-sm font-bold uppercase tracking-wide text-on-surface-variant mb-3">
          Full-time roster
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {fulltimeRoster.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isSelected={selectedPlayers.includes(player.id)}
              onToggle={handlePlayerToggle}
            />
          ))}
        </div>
      </section>

      {openSlotRoster.length > 0 && (
        <section className="mb-6">
          <h2 className="font-headline text-sm font-bold uppercase tracking-wide text-on-surface-variant mb-3">
            Open slot
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {openSlotRoster.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isSelected={selectedPlayers.includes(player.id)}
                onToggle={handlePlayerToggle}
              />
            ))}
          </div>
        </section>
      )}

      {createError && (
        <p role="alert" className="text-error text-sm mb-4">
          {createError}
        </p>
      )}

      {scorelessSelection && (
        <BulkScorePanel
          players={scorelessSelection}
          suggestedScore={suggestedScore}
          onCancel={() => setScorelessSelection(null)}
          onSubmit={handleBulkScoreSubmit}
        />
      )}

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

export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadAdminOrRedirect(context);
};
