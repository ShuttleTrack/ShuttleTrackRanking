import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { usePlayerContext } from '@/contexts/PlayerContext';
import { capitalizeFirstLetter } from '@/utils/string';
import { gameStorageService } from '@/services/gameStorageService';
import type { GameScore } from '@/services/gameStorageService';

interface MatchCombination {
  team1: string[];
  team2: string[];
}

interface MatchScore {
  team1Score: number;
  team2Score: number;
}

interface GroupScores {
  [matchIndex: number]: MatchScore;
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

const getMatchCombinations = (players: string[]): MatchCombination[] => {
  if (players.length === 4) {
    const [a, b, c, d] = players;
    return [
      { team1: [a, b], team2: [c, d] }, // AB-CD
      { team1: [a, c], team2: [b, d] }, // AC-BD
      { team1: [a, d], team2: [b, c] }  // AD-BC
    ];
  } else if (players.length === 5) {
    const [a, b, c, d, e] = players;
    return [
      { team1: [a, b], team2: [c, d] }, // AB-CD
      { team1: [a, c], team2: [b, e] }, // AC-BE
      { team1: [a, e], team2: [b, d] }, // AE-BD
      { team1: [a, d], team2: [c, e] }, // AD-CE
      { team1: [b, c], team2: [d, e] }  // BC-DE
    ];
  }
  return [];
};

const MAX_POINTS = 30;

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

// Add helper function to count games
const getGameStats = (groups: Record<string, any>, scores: Record<string, any>) => {
  let totalGames = 0;
  let completedGames = 0;

  Object.entries(groups).forEach(([groupName, players]) => {
    const matchCount = getMatchCombinations((players as any[]).map(p => p.name)).length;
    totalGames += matchCount;
    
    if (scores[groupName]) {
      Object.values(scores[groupName]).forEach((score: any) => {
        if (score.team1Score > 0 || score.team2Score > 0) {
          completedGames++;
        }
      });
    }
  });

  return { totalGames, completedGames };
};

const ScoreKeeperPage = () => {
  const router = useRouter();
  const { players } = usePlayerContext();
  const { gameId } = router.query;
  const [gameData, setGameData] = React.useState<GameScore | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeGroup, setActiveGroup] = useState<string>('');
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<SelectedMatch | null>(null);
  
  // Fetch game data from IndexedDB
  React.useEffect(() => {
    const fetchGame = async () => {
      if (typeof gameId !== 'string') return;
      
      try {
        const game = await gameStorageService.getGame(gameId);
        if (game) {
          // Initialize scores if they don't exist
          const gameWithScores = {
            ...game,
            scores: game.scores || {}  // Ensure scores object exists
          };
          setGameData(gameWithScores);
          
          // Set initial active group
          if (Object.keys(game.groups).length > 0 && !activeGroup) {
            setActiveGroup(Object.keys(game.groups)[0]);
          }
        } else {
          setGameData(null);
        }
      } catch (error) {
        console.error('Failed to fetch game:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGame();
  }, [gameId, activeGroup]);

  const handleScoreSubmit = async (team1Score: number, team2Score: number) => {
    if (!selectedMatch || !gameData || typeof gameId !== 'string') return;

    const newScores = {
      ...gameData.scores || {},
      [selectedMatch.groupName]: {
        ...(gameData.scores?.[selectedMatch.groupName] || {}),
        [selectedMatch.matchIndex]: { team1Score, team2Score }
      }
    };

    try {
      await gameStorageService.updateGameScores(gameId, newScores);
      setGameData({
        ...gameData,
        scores: newScores
      });
      setSelectedMatch(null);
    } catch (error) {
      console.error('Failed to update scores:', error);
    }
  };

  const handleBack = () => {
    router.push({
      pathname: '/admin/game-day',
      query: { gameId }
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold text-red-600">Game not found</h1>
        <button 
          className="btn btn-primary mt-4"
          onClick={handleBack}
        >
          Back to Game Day
        </button>
      </div>
    );
  }

  // Convert player IDs to full player objects
  const groups = Object.entries(gameData.groups).reduce((acc, [groupName, playerIds]) => {
    acc[groupName] = playerIds
      .map(id => players.find(p => p.id === id))
      .filter((player): player is NonNullable<typeof player> => player !== undefined)
      .sort((a, b) => a.playerRank - b.playerRank);
    return acc;
  }, {} as Record<string, typeof players>);

  // Initialize scores for a group if not exists
  const initializeGroupScores = (groupName: string) => {
    if (!gameData.scores[groupName]) {
      const matchCount = getMatchCombinations(groups[groupName].map(p => p.name)).length;
      const groupScores: GroupScores = {};
      
      for (let i = 0; i < matchCount; i++) {
        groupScores[i] = { team1Score: 0, team2Score: 0 };
      }
      
      setGameData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scores: {
            ...prev.scores,
            [groupName]: groupScores
          }
        };
      });
    }
  };

  // Update score for a specific match
  const handleScoreChange = (
    groupName: string,
    matchIndex: number,
    team: 'team1Score' | 'team2Score',
    value: string
  ) => {
    const numValue = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(numValue)) return;

    setGameData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scores: {
          ...prev.scores,
          [groupName]: {
            ...prev.scores?.[groupName],
            [matchIndex]: {
              ...prev.scores?.[groupName]?.[matchIndex],
              [team]: numValue
            }
          }
        }
      };
    });
  };

  const handleStart = () => {
    setIsGameStarted(true);
  };

  const handleMatchClick = (groupName: string, matchIndex: number, match: MatchCombination) => {
    if (!isGameStarted) return;
    setSelectedMatch({
      groupName,
      matchIndex,
      team1: match.team1,
      team2: match.team2
    });
  };

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent">
          Score Keeper
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Record match results for each group
        </p>
      </div>

      {/* Tab Navigation - Scrollable on mobile */}
      <div className="overflow-x-auto mb-6">
        <div className="tabs tabs-boxed inline-flex min-w-full justify-center">
          {Object.keys(groups)
            .filter(key => key !== 'management')
            .map((groupName) => (
              <button
                key={groupName}
                className={`tab tab-lg ${activeGroup === groupName ? 'tab-active' : ''}`}
                onClick={() => setActiveGroup(groupName)}
              >
                {groupName}
              </button>
            ))}
        </div>
      </div>

      {/* Floating Management Button */}
      <button
        className="fixed bottom-6 right-6 btn btn-circle btn-primary shadow-lg"
        onClick={() => setActiveGroup('management')}
        title="Game Management"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Active Group Content */}
      {activeGroup === 'management' ? (
        <div className="bg-base-100 rounded-lg shadow-lg p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Game Management</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Game Progress Section */}
            <div className="space-y-4">
              <h3 className="text-md font-medium">Game Progress</h3>
              {!isGameStarted ? (
                <div className="text-center p-6 bg-base-200 rounded-lg">
                  <p className="text-gray-600">Click Start Games to begin recording scores</p>
                  <button 
                    className="btn btn-primary mt-4"
                    onClick={handleStart}
                  >
                    Start Games
                  </button>
                </div>
              ) : (
                <>
                  {(() => {
                    const { totalGames, completedGames } = getGameStats(groups, gameData.scores || {});
                    const progressPercent = Math.round((completedGames / totalGames) * 100);
                    
                    return (
                      <div className="p-6 bg-base-200 rounded-lg">
                        <div className="text-center mb-4">
                          <div className="text-2xl font-bold text-primary">
                            {completedGames} / {totalGames}
                          </div>
                          <div className="text-sm text-gray-600">Games Completed</div>
                        </div>
                        <div className="w-full bg-base-300 rounded-full h-2.5">
                          <div 
                            className="bg-primary h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                          ></div>
                        </div>
                        <div className="text-center mt-2 text-sm text-gray-600">
                          {progressPercent}% Complete
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Actions Section */}
            <div className="space-y-4">
              <h3 className="text-md font-medium">Actions</h3>
              <div className="p-6 bg-base-200 rounded-lg">
                {isGameStarted && (
                  <button 
                    className="btn btn-primary w-full"
                    onClick={() => {
                      // TODO: Handle results submission
                      console.log('Submitting results...');
                    }}
                  >
                    Submit Results
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeGroup && (
        <div className="bg-base-100 rounded-lg shadow-lg p-4 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Players</h2>
            <div className="flex flex-wrap gap-2">
              {groups[activeGroup].map((player) => (
                <div 
                  key={player.id} 
                  className="px-3 py-1 bg-base-200 rounded-lg text-sm font-medium"
                >
                  {capitalizeFirstLetter(player.name)}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Matches</h2>
            <div className="space-y-3">
              {getMatchCombinations(groups[activeGroup].map(p => p.name)).map((match, idx) => {
                const matchScore = gameData?.scores?.[activeGroup]?.[idx];
                const hasScore = !!matchScore;
                const isPlayed = hasScore && (matchScore.team1Score > 0 || matchScore.team2Score > 0);
                const team1Won = isPlayed && matchScore.team1Score > matchScore.team2Score;
                const team2Won = isPlayed && matchScore.team2Score > matchScore.team1Score;

                return (
                  <div 
                    key={idx} 
                    className={`bg-base-200 rounded-lg p-3 ${isGameStarted ? 'cursor-pointer hover:bg-base-300' : ''}`}
                    onClick={() => handleMatchClick(activeGroup, idx, match)}
                  >
                    <div className="grid grid-cols-11 gap-2 items-center">
                      <div className="col-span-4">
                        <div className={`text-center p-2 rounded ${
                          isPlayed 
                            ? (team1Won ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30') 
                            : 'bg-base-100'
                        }`}>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            {isPlayed && (
                              <span className={`flex items-center justify-center w-4 h-4 rounded-full ${
                                team1Won 
                                  ? 'bg-emerald-600 text-white' 
                                  : 'bg-red-600 text-white'
                              }`}>
                                {team1Won ? '✓' : '×'}
                              </span>
                            )}
                            <div className="text-xs font-medium">
                              {capitalizeFirstLetter(match.team1[0])}
                            </div>
                          </div>
                          <div className="text-xs font-medium">
                            {capitalizeFirstLetter(match.team1[1])}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-3 text-center">
                        <div className="font-bold text-lg">
                          {hasScore ? 
                            `${matchScore.team1Score} - ${matchScore.team2Score}` 
                            : 'vs'}
                        </div>
                      </div>
                      <div className="col-span-4">
                        <div className={`text-center p-2 rounded ${
                          isPlayed 
                            ? (team2Won ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30') 
                            : 'bg-base-100'
                        }`}>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            {isPlayed && (
                              <span className={`flex items-center justify-center w-4 h-4 rounded-full ${
                                team2Won 
                                  ? 'bg-emerald-600 text-white' 
                                  : 'bg-red-600 text-white'
                              }`}>
                                {team2Won ? '✓' : '×'}
                              </span>
                            )}
                            <div className="text-xs font-medium">
                              {capitalizeFirstLetter(match.team2[0])}
                            </div>
                          </div>
                          <div className="text-xs font-medium">
                            {capitalizeFirstLetter(match.team2[1])}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Score Input Modal */}
      {selectedMatch && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Enter Match Score</h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <div className="font-medium text-center">
                  {selectedMatch.team1.map(capitalizeFirstLetter).join(' & ')}
                </div>
                <input
                  type="number"
                  min="0"
                  max={MAX_POINTS}
                  className="input input-bordered w-full text-center"
                  defaultValue={gameData.scores[selectedMatch.groupName]?.[selectedMatch.matchIndex]?.team1Score || 0}
                  id="team1Score"
                  onInput={(e) => {
                    const input = e.target as HTMLInputElement;
                    if (input.value && !isValidScore(parseInt(input.value))) {
                      input.value = input.value.slice(0, -1);
                    }
                  }}
                />
              </div>
              <div className="text-center font-bold">vs</div>
              <div className="space-y-2">
                <div className="font-medium text-center">
                  {selectedMatch.team2.map(capitalizeFirstLetter).join(' & ')}
                </div>
                <input
                  type="number"
                  min="0"
                  max={MAX_POINTS}
                  className="input input-bordered w-full text-center"
                  defaultValue={gameData.scores[selectedMatch.groupName]?.[selectedMatch.matchIndex]?.team2Score || 0}
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
            <div className="text-sm text-gray-500 mt-2">
              * Scores must be between 0 and {MAX_POINTS} points
              <br />
              * Scores cannot be equal
            </div>
            <div className="modal-action">
              <button 
                className="btn btn-outline"
                onClick={() => setSelectedMatch(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const team1Score = parseInt((document.getElementById('team1Score') as HTMLInputElement).value);
                  const team2Score = parseInt((document.getElementById('team2Score') as HTMLInputElement).value);
                  
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
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setSelectedMatch(null)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
};

export default ScoreKeeperPage; 