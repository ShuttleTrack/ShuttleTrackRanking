import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { capitalizeFirstLetter } from '@/utils/string';
import { validateEditPassword } from '@/utils/password';
import { ProcessScoresModal } from '@/components/score-keeper/ProcessScoresModal';
import { usePlayers } from '@/hooks/usePlayers';
import { useGame } from '@/hooks/useGame';
import { gameService } from '@/services/gameService';
import type { Player } from '@/types/player';
import { notificationService } from '@/services/notificationService';
import { getMatchCombinations, type MatchCombination } from '@/utils/match';
import { isValidMatchScore } from '@/utils/scoreValidation';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import MatchResultLegend from '@/components/matches/MatchResultLegend';
import MatchScoreRow from '@/components/matches/MatchScoreRow';
import { PageLoader } from '@/components/common/GameLoader';
import { resolveSquadAdminOrRedirect } from '@/lib/squadPage';
import { useSquad, type SquadSummary } from '@/contexts/SquadContext';

interface MatchScore {
  team1Score: number;
  team2Score: number;
  isSubmitted?: boolean;
}

interface GroupScores {
  [matchIndex: string]: MatchScore;
}

interface AllScores {
  [groupName: string]: GroupScores;
}

interface SelectedMatch {
  groupName: string;
  matchIndex: number;
  team1: string[];
  team2: string[];
}

// Add interface for the error response
interface SubmitErrorResponse {
  errors: Array<{ group: string; match: string; error: string; }>;
}

const MAX_POINTS = 30;

const outlineBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 px-6 py-3 font-medium text-on-surface transition-colors hover:border-primary/40';
const primaryBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const dangerOutlineBtn =
  'inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-red-500/40 px-6 py-3 font-medium text-red-400 transition-colors hover:bg-red-950/30';
const dangerFilledBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-red-600 px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90';
const warningBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-500/50 bg-amber-500/10 px-6 py-3 font-medium text-amber-300 transition-colors hover:bg-amber-500/20';
const inputFieldClass =
  'w-full rounded-xl border border-gray-600 bg-surface-container px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';
const modalBoxClass =
  'relative rounded-xl bg-surface-container-high border border-gray-600 p-6 w-full max-w-lg shadow-xl';
const modalActionsClass = 'flex flex-wrap justify-end gap-3 mt-6';

const isValidScore = (score: number): boolean => {
  return Number.isInteger(score) && score >= 0 && score <= MAX_POINTS;
};

const areValidMatchScores = (team1Score: number, team2Score: number): boolean => {
  return (
    isValidScore(team1Score) &&
    isValidScore(team2Score) &&
    team1Score !== team2Score
  );
};

const ScoreKeeperPage = () => {
  const router = useRouter();
  const { id: squadId, slug } = useSquad();
  const { players, isLoading: playersLoading } = usePlayers();
  const gameId = router.query.gameId as string;
  const { game, isLoading: gameLoading, mutate } = useGame(gameId as string);
  const [activeGroup, setActiveGroup] = useState<string>('Group 1');
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<SelectedMatch | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<SelectedMatch | null>(null);
  const [passwordError, setPasswordError] = useState(false);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [showSubmitPasswordModal, setShowSubmitPasswordModal] = useState(false);
  const [submitPasswordError, setSubmitPasswordError] = useState(false);
  const [showCancelWarning, setShowCancelWarning] = useState(false);
  const [showCancelPasswordModal, setShowCancelPasswordModal] = useState(false);
  const [cancelPasswordError, setCancelPasswordError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processSuccess, setProcessSuccess] = useState(false);
  const [scores, setScores] = useState<Record<string, Record<string, MatchScore>>>({});
  const [failedMatches, setFailedMatches] = useState<Array<{
    group: string;
    match: string;
    error: string;
  }>>([]);

  // Memoize groups calculation
  const groups = useMemo(() => {
    return Object.entries(game?.groups as Record<string, number[]> || {}).reduce((acc, [groupName, playerIds]) => {
      acc[groupName] = playerIds
        .map(id => players.find(p => p.id === id))
        .filter((player): player is NonNullable<typeof player> => player !== undefined)
        .sort((a, b) => a.playerRank - b.playerRank);
      return acc;
    }, {} as Record<string, Player[]>);
  }, [game?.groups, players]);

  // Update score initialization effect
  useEffect(() => {
    if (!game?.groups || !players.length) return;

    // Initialize scores structure for each group
    const initialScores = Object.keys(game.groups as Record<string, number[]>).reduce((acc, groupName) => {
      const groupPlayers = groups[groupName];
      if (!groupPlayers) return acc;

      const matches = getMatchCombinations(groupPlayers.map(p => p.name));

      acc[groupName] = matches.reduce((matchScores, _, index) => {
        const existingScore = (game.scores as any)?.[groupName]?.[index.toString()] || { team1Score: 0, team2Score: 0 };
        matchScores[index.toString()] = existingScore;
        return matchScores;
      }, {} as Record<string, MatchScore>);

      return acc;
    }, {} as Record<string, Record<string, MatchScore>>);

    setScores(initialScores);
    setIsGameStarted(game.status === 'IN_PROGRESS');

  }, [game?.groups, game?.scores, game?.status, players, groups]); // Explicit dependencies

  useEffect(() => {
    // Cleanup function
    return () => {
      setScores({});
      setSelectedMatch(null);
      setPendingMatch(null);
      setActiveGroup('Group 1');
      setIsGameStarted(false);
      setSubmitError(null);
      setProcessError(null);
    };
  }, []);

  const handleScoreSubmit = async (team1Score: number, team2Score: number) => {
    if (!selectedMatch || !gameId || !isValidMatchScore(team1Score, team2Score)) return;

    try {
      // Update local state
      const newScores = {
        ...scores,
        [selectedMatch.groupName]: {
          ...scores[selectedMatch.groupName],
          [selectedMatch.matchIndex]: { team1Score, team2Score }
        }
      };
      setScores(newScores);

      // Update DB
      await gameService.updateGame(squadId, gameId as string, {
        scores: newScores,
        status: 'IN_PROGRESS'
      });

      // Refresh game data
      await mutate();

      // Close score input
      setSelectedMatch(null);
    } catch (error) {
      console.error('Failed to update scores:', error);
      // Optionally show error message to user
    }
  };

  const handleBack = () => {
    router.push(`/s/${slug}/admin/game-day?gameId=${gameId}`, undefined, { shallow: false });
  };

  const handleCancelGame = () => {
    // Show warning modal first
    setShowCancelWarning(true);
  };

  const handleCancelConfirm = () => {
    // Close warning modal and show password modal
    setShowCancelWarning(false);
    setShowCancelPasswordModal(true);
  };

  const handleCancelPasswordVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    try {
      // First validate password on FE
      const isValid = await validateEditPassword(password);
      if (!isValid) {
        setCancelPasswordError(true);
        return;
      }

      // If password is valid, call API to delete game
      if (typeof gameId === 'string') {
        const response = await fetch(`/api/squads/${squadId}/games/${gameId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          throw new Error('Failed to delete game');
        }

        await notificationService.notifyGameCancelled(gameId);
        // Only redirect after successful deletion
        router.push(`/s/${slug}/admin/dashboard`, undefined, { shallow: false });
      }
    } catch (error) {
      console.error('Error verifying password:', error);
      setCancelPasswordError(true);
    }
  };

  const handleProcessScores = async () => {
    if (!gameId) return;

    setIsProcessing(true);
    setProcessError(null);

    try {
      await gameService.processGame(squadId, gameId);
      const notificationSent = await notificationService.notifyGameCompleted(slug, gameId);
      if (!notificationSent) {
        console.warn('Notification was cancelled or failed to send');
      }
      await gameService.deleteGame(squadId, gameId);
      setProcessSuccess(true);
      router.push(`/s/${slug}/admin/dashboard`, undefined, { shallow: false });
    } catch (error) {
      console.error('Error processing scores:', error);
      setProcessError(error instanceof Error ? error.message : 'Failed to process scores');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!gameId) return;

    setIsSubmitting(true);
    setSubmitProgress(0);
    setSubmitError(null);
    setFailedMatches([]);

    try {
      const response = await gameService.submitGame(squadId, gameId);

      // Update the condition to check response type
      if ('errors' in response && Array.isArray((response as SubmitErrorResponse).errors)) {
        setFailedMatches((response as SubmitErrorResponse).errors);
        setSubmitError('Some matches failed to submit. Please check the errors below and try again.');
        return;
      }

      // Show success message and prompt for processing
      setIsSubmitting(false);
      setShowProcessModal(true);
    } catch (error) {
      console.error('Submission error:', error);
      setSubmitError('Failed to submit game results');
      return;
    }
  };

  const handleStart = async () => {
    if (!gameId) return;

    try {
      await gameService.startGame(squadId, gameId as string);
      await notificationService.notifyGameStarted(slug, gameId);
      setIsGameStarted(true);
      await mutate(); // Refresh game data
    } catch (error) {
      console.error('Failed to start game:', error);
      // Optionally show an error message to the user
    }
  };

  if (gameLoading || playersLoading) {
    return <PageLoader variant="compact" label="Loading score keeper" />;
  }

  if (!game) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8 text-center">
        <h1 className="font-headline text-2xl font-extrabold text-on-surface">Game not found</h1>
        <button
          type="button"
          className={`${primaryBtn} mt-6`}
          onClick={() => router.push(`/s/${slug}/admin/game-planner`)}
        >
          Back to Game Planner
        </button>
      </div>
    );
  }

  const handleMatchClick = (groupName: string, matchIndex: number, match: MatchCombination) => {
    if (!isGameStarted) return;

    // Check if match already has scores
    const existingScore = scores[groupName]?.[matchIndex];
    const hasRealScores = existingScore &&
      (existingScore.team1Score > 0 || existingScore.team2Score > 0);

    if (hasRealScores) {
      // Store the match details and show password modal for existing non-zero scores
      setPendingMatch({
        groupName,
        matchIndex,
        team1: match.team1,
        team2: match.team2
      });
      setPasswordModalOpen(true);
    } else {
      // For new scores or 0-0 scores, no password needed
      setSelectedMatch({
        groupName,
        matchIndex,
        team1: match.team1,
        team2: match.team2
      });
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const passwordInput = (document.getElementById('edit-password') as HTMLInputElement).value;

    if (validateEditPassword(passwordInput)) {
      setPasswordModalOpen(false);
      setPasswordError(false);
      setSelectedMatch(pendingMatch);
      setPendingMatch(null);
    } else {
      setPasswordError(true);
    }
  };

  const handleSubmitResults = () => {
    const { totalGames, completedGames } = getGameStats(groups, scores);

    if (completedGames < totalGames) {
      setShowSubmitWarning(true);
    } else {
      setShowSubmitPasswordModal(true);
    }
  };

  const handleSubmitPasswordVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const passwordInput = (document.getElementById('submit-password') as HTMLInputElement).value;

    if (validateEditPassword(passwordInput)) {
      setShowSubmitPasswordModal(false);
      setSubmitPasswordError(false);
      handleFinalSubmit();
    } else {
      setSubmitPasswordError(true);
    }
  };

  const getGameStats = (groups: Record<string, Player[]>, scores: Record<string, Record<string, MatchScore>>) => {
    let totalGames = 0;
    let completedGames = 0;

    Object.entries(groups).forEach(([groupName, players]) => {
      const matches = getMatchCombinations(players.map(p => p.name));
      totalGames += matches.length;

      // Count completed matches
      if (scores[groupName]) {
        Object.values(scores[groupName]).forEach(match => {
          if (match.team1Score > 0 || match.team2Score > 0) {
            completedGames++;
          }
        });
      }
    });

    return { totalGames, completedGames };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <section className="mb-6 sm:mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
            Score Keeper
          </h1>
          <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
        </div>
        <button
          type="button"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-black shadow-lg transition-all hover:opacity-90 ${
            activeGroup === 'management' ? 'ring-2 ring-primary-container ring-offset-2 ring-offset-background' : ''
          }`}
          onClick={() => {
            if (activeGroup === 'management') {
              const firstGroup = Object.keys(groups).find((key) => key !== 'management');
              if (firstGroup) setActiveGroup(firstGroup);
            } else {
              setActiveGroup('management');
            }
          }}
          title="Game Management"
          aria-label="Game Management"
        >
          <Cog6ToothIcon className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
      </section>

      {activeGroup !== 'management' && (
      <div className="overflow-x-auto mb-6 -mx-1 px-1">
        <div className="flex justify-center min-w-min mx-auto">
          <div className="inline-flex rounded-xl bg-surface-container p-1 gap-1">
            {Object.keys(groups)
              .filter((key) => key !== 'management')
              .map((groupName) => (
                <button
                  key={groupName}
                  type="button"
                  className={`min-h-[44px] px-4 sm:px-6 rounded-lg font-headline text-sm font-semibold whitespace-nowrap transition-colors ${
                    activeGroup === groupName
                      ? 'bg-primary text-black'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => setActiveGroup(groupName)}
                >
                  {groupName}
                </button>
              ))}
          </div>
        </div>
      </div>
      )}

      {/* Active Group Content */}
      {activeGroup === 'management' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-4">
              <h3 className="font-headline text-sm font-medium text-on-surface-variant">Game Progress</h3>
              {!isGameStarted ? (
                <div className="text-center p-6 rounded-xl bg-surface-container border border-gray-600">
                  <p className="text-on-surface-variant">Click Start Games to begin recording scores</p>
                  <button type="button" className={`${primaryBtn} mt-4`} onClick={handleStart}>
                    Start Games
                  </button>
                </div>
              ) : (
                (() => {
                  const { totalGames, completedGames } = getGameStats(groups, scores);
                  const progressPercent = Math.round((completedGames / totalGames) * 100);

                  return (
                    <div className="p-6 rounded-xl bg-surface-container border border-gray-600">
                      <div className="text-center mb-4">
                        <div className="font-numeric text-2xl font-bold text-primary tabular-nums">
                          {completedGames} / {totalGames}
                        </div>
                        <div className="text-sm text-on-surface-variant">Games Completed</div>
                      </div>
                      <div className="w-full bg-surface-container-highest rounded-full h-2.5">
                        <div
                          className="bg-primary h-2.5 rounded-full transition-all duration-500"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="text-center mt-2 text-sm text-on-surface-variant font-numeric tabular-nums">
                        {progressPercent}% Complete
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-headline text-sm font-medium text-on-surface-variant">Actions</h3>
              <div className="p-6 rounded-xl bg-surface-container border border-gray-600 space-y-3">
                {isGameStarted && (
                  <>
                    <button type="button" className={`${primaryBtn} w-full`} onClick={handleSubmitResults}>
                      Submit Results
                    </button>
                    <button type="button" className={dangerOutlineBtn} onClick={handleCancelGame}>
                      Cancel Game
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        activeGroup &&
        groups[activeGroup] && (
          <div className="space-y-6">
            <div>
              <h2 className="font-headline text-lg font-semibold text-on-surface mb-3">Players</h2>
              <div className="flex flex-wrap gap-2">
                {groups[activeGroup].map((player) => (
                  <div
                    key={player.id}
                    className="px-3 py-1.5 rounded-xl bg-surface-container border border-gray-600 text-sm font-headline font-medium text-on-surface"
                  >
                    {capitalizeFirstLetter(player.name)}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-headline text-lg font-semibold text-on-surface mb-3">Matches</h2>
              <MatchResultLegend className="mb-4" />
              <div className="space-y-3">
                {getMatchCombinations(groups[activeGroup].map((p) => p.name)).map((match, idx) => {
                  const matchScore = scores[activeGroup]?.[idx];
                  return (
                    <MatchScoreRow
                      key={idx}
                      team1={match.team1}
                      team2={match.team2}
                      team1Score={matchScore?.team1Score ?? 0}
                      team2Score={matchScore?.team2Score ?? 0}
                      showResultChips={false}
                      interactive={isGameStarted}
                      onActivate={() => handleMatchClick(activeGroup, idx, match)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )
      )}

      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={modalBoxClass} role="dialog" aria-modal="true">
            <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">
              Enter Password to Edit Score
            </h3>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                id="edit-password"
                className={`${inputFieldClass} ${passwordError ? 'border-red-500' : ''}`}
                placeholder="Enter password"
                autoComplete="off"
              />
              {passwordError && (
                <p className="text-sm text-red-400 mt-2">Incorrect password</p>
              )}
              <div className={modalActionsClass}>
                <button
                  type="button"
                  className={outlineBtn}
                  onClick={() => {
                    setPasswordModalOpen(false);
                    setPasswordError(false);
                    setPendingMatch(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={primaryBtn}>
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={modalBoxClass} role="dialog" aria-modal="true">
            <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">Enter Match Score</h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <div className="font-headline font-medium text-center text-on-surface">
                  {selectedMatch.team1.map(capitalizeFirstLetter).join(' & ')}
                </div>
                <input
                  type="number"
                  className={inputFieldClass}
                  defaultValue={scores[selectedMatch.groupName]?.[selectedMatch.matchIndex]?.team1Score || 0}
                  min={0}
                  max={MAX_POINTS}
                  id="team1Score"
                  onInput={(e) => {
                    const input = e.target as HTMLInputElement;
                    if (input.value && !isValidScore(parseInt(input.value))) {
                      input.value = input.value.slice(0, -1);
                    }
                  }}
                />
              </div>
              <div className="text-center font-headline font-bold text-on-surface-variant">vs</div>
              <div className="space-y-2">
                <div className="font-headline font-medium text-center text-on-surface">
                  {selectedMatch.team2.map(capitalizeFirstLetter).join(' & ')}
                </div>
                <input
                  type="number"
                  className={inputFieldClass}
                  defaultValue={scores[selectedMatch.groupName]?.[selectedMatch.matchIndex]?.team2Score || 0}
                  min={0}
                  max={MAX_POINTS}
                  id="team2Score"
                  onInput={(e) => {
                    const input = e.target as HTMLInputElement;
                    if (input.value && !isValidScore(parseInt(input.value))) {
                      input.value = input.value.slice(0, -1);
                    }
                  }}
                />
              </div>
            </div>
            <div className="text-sm text-on-surface-variant mt-3">
              Scores must be between 0 and {MAX_POINTS} points and cannot be equal.
            </div>
            <div className={modalActionsClass}>
              <button type="button" className={outlineBtn} onClick={() => setSelectedMatch(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={primaryBtn}
                onClick={() => {
                  const team1Score = parseInt(
                    (document.getElementById('team1Score') as HTMLInputElement).value,
                  );
                  const team2Score = parseInt(
                    (document.getElementById('team2Score') as HTMLInputElement).value,
                  );

                  if (!areValidMatchScores(team1Score, team2Score)) {
                    alert('Invalid scores. Please check the requirements and try again.');
                    return;
                  }

                  handleScoreSubmit(team1Score, team2Score);
                }}
              >
                Save Score
              </button>
            </div>
          </div>
        </div>
      )}

      {showSubmitPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={modalBoxClass} role="dialog" aria-modal="true">
            <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">
              Confirm Results Submission
            </h3>
            <p className="text-on-surface-variant mb-4">
              Please enter password to submit the final results.
            </p>
            <form onSubmit={handleSubmitPasswordVerify}>
              <input
                type="password"
                id="submit-password"
                className={`${inputFieldClass} ${submitPasswordError ? 'border-red-500' : ''}`}
                placeholder="Enter password"
                autoComplete="off"
              />
              {submitPasswordError && (
                <p className="text-sm text-red-400 mt-2">Incorrect password</p>
              )}
              <div className={modalActionsClass}>
                <button
                  type="button"
                  className={outlineBtn}
                  onClick={() => {
                    setShowSubmitPasswordModal(false);
                    setSubmitPasswordError(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={primaryBtn}>
                  Submit Results
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubmitWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={`${modalBoxClass} border-amber-500/40`} role="dialog" aria-modal="true">
            <div className="flex items-start gap-3 mb-4">
              <svg
                className="w-6 h-6 text-amber-400 flex-shrink-0 mt-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h3 className="font-headline text-lg font-semibold text-amber-300">
                  Warning: Incomplete Matches
                </h3>
                <p className="text-on-surface-variant mt-2">
                  Some matches have not been completed. Submitting now will finalize the game with missing
                  scores.
                </p>
              </div>
            </div>
            <div className={modalActionsClass}>
              <button type="button" className={outlineBtn} onClick={() => setShowSubmitWarning(false)}>
                Go Back
              </button>
              <button
                type="button"
                className={warningBtn}
                onClick={() => {
                  setShowSubmitWarning(false);
                  setTimeout(() => {
                    setShowSubmitPasswordModal(true);
                  }, 100);
                }}
              >
                Submit Incomplete Results
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={modalBoxClass} role="dialog" aria-modal="true">
            <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">Cancel Game</h3>
            <p className="text-on-surface-variant mb-4">
              Are you sure you want to cancel this game? All scores and progress will be permanently deleted.
            </p>
            <div className={modalActionsClass}>
              <button type="button" className={outlineBtn} onClick={() => setShowCancelWarning(false)}>
                Go Back
              </button>
              <button type="button" className={dangerFilledBtn} onClick={handleCancelConfirm}>
                Yes, Cancel Game
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={modalBoxClass} role="dialog" aria-modal="true">
            <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">
              Confirm Game Cancellation
            </h3>
            <p className="text-on-surface-variant mb-4">
              Please enter password to confirm game cancellation.
            </p>
            <form onSubmit={handleCancelPasswordVerify}>
              <input
                type="password"
                id="password"
                name="password"
                className={`${inputFieldClass} ${cancelPasswordError ? 'border-red-500' : ''}`}
                placeholder="Enter password"
                autoComplete="off"
              />
              {cancelPasswordError && (
                <p className="text-sm text-red-400 mt-2">Incorrect password</p>
              )}
              <div className={modalActionsClass}>
                <button
                  type="button"
                  className={outlineBtn}
                  onClick={() => {
                    setShowCancelPasswordModal(false);
                    setCancelPasswordError(false);
                  }}
                >
                  Go Back
                </button>
                <button type="submit" className={dangerFilledBtn}>
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={modalBoxClass} role="dialog" aria-modal="true">
            <h3 className="font-headline text-lg font-semibold text-on-surface mb-4">Submitting Results</h3>
            <div className="w-full bg-surface-container-highest rounded-full h-2.5 mb-4">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${submitProgress}%` }}
              />
            </div>
            <p className="text-center text-sm text-on-surface-variant mb-4 font-numeric tabular-nums">
              {submitProgress.toFixed(0)}% Complete
            </p>

            {submitError && (
              <div className="mt-4 p-4 rounded-xl border border-red-500/40 bg-red-950/20">
                <p className="text-red-400 text-sm mb-2">{submitError}</p>

                {failedMatches.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-headline font-medium text-on-surface mb-2">Failed Matches:</h4>
                    <div className="max-h-48 overflow-y-auto">
                      {failedMatches.map((error, index) => (
                        <div
                          key={index}
                          className="text-sm mb-2 p-2 rounded-lg bg-surface-container border border-gray-600"
                        >
                          <p className="text-on-surface">
                            <span className="font-medium">{error.group}</span> - Match{' '}
                            {parseInt(error.match) + 1}
                          </p>
                          <p className="text-red-400 text-xs mt-1">{error.error}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className={outlineBtn}
                    onClick={() => {
                      setIsSubmitting(false);
                      setSubmitError(null);
                      setFailedMatches([]);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className={primaryBtn} onClick={() => handleFinalSubmit()}>
                    Retry All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ProcessScoresModal
        isOpen={showProcessModal}
        isProcessing={isProcessing}
        error={processError}
        success={processSuccess}
        onProcess={handleProcessScores}
        onRetry={handleProcessScores}
        title="All Scores Submitted Successfully!"
        message="Would you like to process the results now?"
        onClose={() => {
          if (processSuccess || (!processError && !isProcessing)) {
            setShowProcessModal(false);
            setProcessError(null);
            setProcessSuccess(false);
            router.push(`/s/${slug}/admin/dashboard`, undefined, { shallow: false });
          } else {
            setShowProcessModal(false);
            setProcessError(null);
          }
        }}
      />
    </div>
  );
};

export default ScoreKeeperPage;

export const getServerSideProps: GetServerSideProps<{ squad: SquadSummary }> = async (context) => {
  return resolveSquadAdminOrRedirect(context);
};
