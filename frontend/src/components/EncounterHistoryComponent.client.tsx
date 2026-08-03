import React, { useState, useMemo, useRef, useEffect } from 'react';
import { usePlayers } from '@/hooks/usePlayers';
import { useEncounterHistory } from '@/hooks/useEncounterHistory';
import { capitalizeFirstLetter } from '@/utils/string';
import { ScoreBreakdown } from '@/types/encounter';
import ScoreBreakdownPills from './ScoreBreakdownPills';

interface Encounter {
  encounterDate: string;
  encounterId: number;
  encounterScore: number;
  opponentTeam: { playerName: string; playerId: number }[];
  opponentTeamPoints: number;
  playerTeam: { playerName: string; playerId: number }[];
  playerTeamPoints: number;
  scoreBreakdown?: ScoreBreakdown | null;
  groupIndex?: number | null;
  totalGroups?: number | null;
}

const EncounterHistoryComponent = () => {
  const { players, isLoading: playersLoading } = usePlayers();
  const [teamA1, setTeamA1] = useState<number>(0);
  const [teamA2, setTeamA2] = useState<number>(0);
  const [teamB1, setTeamB1] = useState<number>(0);
  const [teamB2, setTeamB2] = useState<number>(0);
  const [searchA1, setSearchA1] = useState('');
  const [searchA2, setSearchA2] = useState('');
  const [searchB1, setSearchB1] = useState('');
  const [searchB2, setSearchB2] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);

  const { encounters, isLoading: encountersLoading, fetchEncounters } = useEncounterHistory(teamA1, teamA2, teamB1, teamB2);

  const sortedPlayers = useMemo(() => 
    [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as Element).closest('.dropdown-container')) {
        setDropdownOpen('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFilteredPlayers = (search: string) => {
    return sortedPlayers.filter(player => 
      player.name.toLowerCase().includes(search.toLowerCase())
    );
  };

  const renderCombobox = (
    value: number,
    onChange: (value: number) => void,
    search: string,
    setSearch: (value: string) => void,
    id: string,
    required: boolean = false
  ) => {
    const selectedPlayer = sortedPlayers.find(p => p.id === value);
    const filteredPlayers = getFilteredPlayers(search);

    return (
      <div className="relative dropdown-container">
        <div 
          className={`select select-bordered w-full flex items-center justify-between cursor-pointer ${
            dropdownOpen === id ? 'select-active' : ''
          }`}
          onClick={() => setDropdownOpen(prev => prev === id ? '' : id)}
        >
          <span className="block truncate">
            {selectedPlayer ? capitalizeFirstLetter(selectedPlayer.name) : 'Select player...'}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </span>
        </div>

        {dropdownOpen === id && (
          <div className="absolute z-10 mt-1 w-full rounded-md bg-base-100 shadow-lg">
            <div className="p-2">
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="Search players..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
            <ul className="max-h-60 overflow-auto py-1">
              <li
                className="px-3 py-2 hover:bg-base-200 cursor-pointer"
                onClick={() => {
                  onChange(0);
                  setDropdownOpen('');
                  setSearch('');
                }}
              >
                Select player...
              </li>
              {filteredPlayers.map((player) => (
                <li
                  key={player.id}
                  className={`px-3 py-2 hover:bg-base-200 cursor-pointer ${
                    player.id === value ? 'bg-base-200' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(player.id);
                    setDropdownOpen('');
                    setSearch('');
                  }}
                >
                  {capitalizeFirstLetter(player.name)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Validation for duplicate players
  const getValidationError = () => {
    const selectedPlayers = [teamA1, teamA2, teamB1, teamB2].filter(id => id !== 0);
    const uniquePlayers = new Set(selectedPlayers);
    
    if (selectedPlayers.length !== uniquePlayers.size) {
      return "A player can't be selected multiple times";
    }
    
    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = getValidationError();
    if (validationError) {
      alert(validationError);
      return;
    }

    await fetchEncounters();
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }, 100);
  };

  const validationError = getValidationError();

  const renderResults = (encounters: Encounter[]) => {
    if (!encounters || encounters.length === 0) {
      return (
        <div className="text-center text-gray-500 py-8">
          No matches found for these players
        </div>
      );
    }

    return (
      <>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table w-full">
            <thead className="bg-base-200">
              <tr>
                <th className="text-left">Date</th>
                <th className="text-center">Team 1</th>
                <th className="text-center">Score</th>
                <th className="text-center">Team 2</th>
                <th className="text-center">Points</th>
              </tr>
            </thead>
            <tbody>
              {encounters.map((encounter) => {
                const isWin = encounter.playerTeamPoints > encounter.opponentTeamPoints;
                return (
                  <tr 
                    key={encounter.encounterId}
                    className="hover:bg-base-200 transition-colors duration-150"
                  >
                    <td className="whitespace-nowrap">
                      {new Date(encounter.encounterDate).toLocaleDateString()}
                    </td>
                    <td className={isWin ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}>
                      <div className="flex items-center">
                        <span className={`mr-2 flex items-center justify-center w-5 h-5 rounded-full ${
                          isWin 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-red-600 text-white'
                        }`}>
                          {isWin ? '✓' : '×'}
                        </span>
                        {encounter.playerTeam
                          .map(player => capitalizeFirstLetter(player.playerName))
                          .join(', ')}
                      </div>
                    </td>
                    <td className="text-center whitespace-nowrap">
                      {encounter.playerTeamPoints} - {encounter.opponentTeamPoints}
                    </td>
                    <td className={!isWin ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}>
                      <div className="flex items-center">
                        <span className={`mr-2 flex items-center justify-center w-5 h-5 rounded-full ${
                          !isWin 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-red-600 text-white'
                        }`}>
                          {!isWin ? '✓' : '×'}
                        </span>
                        {encounter.opponentTeam
                          .map(player => capitalizeFirstLetter(player.playerName))
                          .join(', ')}
                      </div>
                    </td>
                    <td className="text-center">
                      <span
                        className={`font-medium ${
                          encounter.encounterScore > 0 ? 'text-success' : 'text-error'
                        }`}
                      >
                        {encounter.encounterScore > 0 ? '+' : ''}
                        {encounter.encounterScore.toFixed(2)}
                      </span>
                      <ScoreBreakdownPills
                        breakdown={encounter.scoreBreakdown}
                        groupIndex={encounter.groupIndex}
                        totalGroups={encounter.totalGroups}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {encounters.map((encounter) => {
            const isWin = encounter.playerTeamPoints > encounter.opponentTeamPoints;
            return (
              <div 
                key={encounter.encounterId}
                className="bg-base-200 rounded-lg p-4 space-y-2"
              >
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">
                    {new Date(encounter.encounterDate).toLocaleDateString()}
                  </span>
                  <div className="text-right">
                    <span
                      className={`font-medium ${
                        encounter.encounterScore > 0 ? 'text-success' : 'text-error'
                      }`}
                    >
                      {encounter.encounterScore > 0 ? '+' : ''}
                      {encounter.encounterScore.toFixed(2)}
                    </span>
                    <ScoreBreakdownPills
                      breakdown={encounter.scoreBreakdown}
                      groupIndex={encounter.groupIndex}
                      totalGroups={encounter.totalGroups}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <div className={`col-span-1 rounded p-2 ${
                    isWin ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    <div className="font-medium flex flex-col items-center">
                      <span className={`mb-1 flex items-center justify-center w-5 h-5 rounded-full ${
                        isWin 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-red-600 text-white'
                      }`}>
                        {isWin ? '✓' : '×'}
                      </span>
                      <span className="text-center">
                        {encounter.playerTeam
                          .map(player => capitalizeFirstLetter(player.playerName))
                          .join(', ')}
                      </span>
                    </div>
                  </div>
                  <div className="col-span-1 text-center font-bold">
                    {encounter.playerTeamPoints} - {encounter.opponentTeamPoints}
                  </div>
                  <div className={`col-span-1 rounded p-2 ${
                    !isWin ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    <div className="font-medium flex flex-col items-center">
                      <span className={`mb-1 flex items-center justify-center w-5 h-5 rounded-full ${
                        !isWin 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-red-600 text-white'
                      }`}>
                        {!isWin ? '✓' : '×'}
                      </span>
                      <span className="text-center">
                        {encounter.opponentTeam
                          .map(player => capitalizeFirstLetter(player.playerName))
                          .join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className='container mx-auto p-4'>
      {/* Title Section */}
      <div className="mb-6 sm:mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent">
          Find Encounters
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Select players to find their matches together
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] items-center gap-8">
          {/* Team 1 */}
          <div className="bg-base-200 p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4 text-center">Team 1</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Player 1 <span className="text-error">*</span>
                </label>
                {renderCombobox(teamA1, setTeamA1, searchA1, setSearchA1, 'a1', true)}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Player 2</label>
                {renderCombobox(teamA2, setTeamA2, searchA2, setSearchA2, 'a2')}
              </div>
            </div>
          </div>

          {/* VS Divider - Desktop & Mobile Combined */}
          <div className="flex justify-center">
            <div className="bg-base-200 rounded-full p-3 md:p-4 shadow-md">
              <span className="text-lg md:text-xl font-bold text-gray-600">VS</span>
            </div>
          </div>

          {/* Team 2 */}
          <div className="bg-base-200 p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4 text-center">Team 2</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Player 1</label>
                {renderCombobox(teamB1, setTeamB1, searchB1, setSearchB1, 'b1')}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Player 2</label>
                {renderCombobox(teamB2, setTeamB2, searchB2, setSearchB2, 'b2')}
              </div>
            </div>
          </div>
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <div className="mt-4 text-center text-error text-sm">
            {validationError}
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-8 text-center">
          <button
            type="submit"
            className="btn btn-primary px-8"
            disabled={!teamA1 || !!validationError || encountersLoading}
          >
            {encountersLoading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                <span className="ml-2">Finding...</span>
              </>
            ) : (
              'Find Matches'
            )}
          </button>
        </div>
      </form>

      {/* Results Section */}
      {encounters && (
        <div className="mt-8" ref={resultsRef}>
          <div className="bg-base-100 rounded-lg shadow-lg">
            <div className="p-4 border-b border-base-200">
              <h2 className="text-xl font-semibold">Match Results</h2>
            </div>
            {renderResults(encounters)}
          </div>
        </div>
      )}
    </div>
  );
};

export default EncounterHistoryComponent;
