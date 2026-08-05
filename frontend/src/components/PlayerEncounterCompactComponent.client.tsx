import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { EncountersResponse, Encounter } from '@/types/encounter';
import { capitalizeFirstLetter, groupBy, sumBy } from '@/utils/string';
import { usePlayers } from '@/hooks/usePlayers';
import { Player } from '@/types/player';
import PlayerEncounterComponent from './PlayerEncounterComponent';
import ScoreBreakdownPills from './ScoreBreakdownPills';
import { Disclosure } from '@headlessui/react';
import { ChevronUpIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { usePlayerEncounters } from '@/hooks/usePlayerEncounters';

interface PlayerEncountersComponentProps {
  playerId: string | string[] | undefined;
}

const PlayerEncountersCompactComponent: React.FC<PlayerEncountersComponentProps> = ({ playerId }) => {
  const { players, isLoading: playersLoading } = usePlayers();
  const { encounters, isLoading: encountersLoading, error } = usePlayerEncounters(playerId);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!playersLoading && players.length > 0) {
      const foundPlayer = players.find((p: Player) => p.id === Number(playerId));
      setPlayer(foundPlayer || null);
    }
  }, [players, playerId, playersLoading]);

  if (encountersLoading || playersLoading) return (
    <div className="flex justify-center items-center min-h-[200px]">
      <div className="loading loading-spinner loading-lg"></div>
    </div>
  );

  if (error) return (
    <div className="alert alert-error">
      <span>Error: {error.message}</span>
    </div>
  );

  if (!encounters) return null;

  const { stats, encountersByDate, scoreSumByDate } = encounters;

  const totalEncounters = Object.values(encountersByDate).flat().length;
  const allEncounters = Object.values(encountersByDate).flat() as Encounter[];
  const wins = allEncounters.filter((e: Encounter) => e.playerTeamPoints > e.opponentTeamPoints).length;
  const losses = totalEncounters - wins;
  const winRate = totalEncounters > 0 ? (wins / totalEncounters * 100).toFixed(1) : '0';

  const renderTableRow = (encounter: Encounter) => {
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
              .map((player) => capitalizeFirstLetter(player.playerName))
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
              .map((player) => capitalizeFirstLetter(player.playerName))
              .join(', ')}
          </div>
        </td>
        <td className="text-center">
          <span className={isWin ? 'text-success' : 'text-error'}>
            {isWin ? 'Won' : 'Lost'}
          </span>
        </td>
        <td
          className={`font-bold ${encounter.encounterScore > 0 ? 'text-green-600' : 'text-red-600'}`}
        >
          {encounter.encounterScore > 0 ? '+' : '-'}
          {Math.abs(encounter.encounterScore)}
          <ScoreBreakdownPills
            breakdown={encounter.scoreBreakdown}
            groupIndex={encounter.groupIndex}
            totalGroups={encounter.totalGroups}
          />
        </td>
      </tr>
    );
  };

  const renderSum=(sum: number) => {
    const formattedSum = (Math.round(sum * 100) / 100).toFixed(2);
    return (
      <span className={`font-bold ${Math.sign(sum) == 1 ? 'text-green-600' : 'text-red-600'}`}>
        Net Score : 
        {Math.sign(sum) == 1 ? '+' : ''}
        {formattedSum}
        </span>
    );
  };

  const renderRankChange = (currentRank: number, previousRank: number) => {
    const change = previousRank - currentRank;
    if (change > 0) {
      return <span className='text-green-500 ml-2'>(▲ {Math.abs(change)})</span>;
    } else if (change < 0) {
      return <span className='text-red-500 ml-2'>(▼ {Math.abs(change)})</span>;
    } else {
      return <span className='text-gray-500 ml-2'>(=)</span>;
    }
  };

  return (
    <div className='container mx-auto p-4'>
      {/* Breadcrumbs */}
      <div className="text-sm breadcrumbs mb-6">
        <ul>
          <li>
            <Link href="/" className="text-gray-600 hover:text-emerald-600">
              Rankings
            </Link>
          </li>
          <li>
            <span className="text-emerald-600">
              {player ? `${capitalizeFirstLetter(player.name)}'s` : 'Player\'s'} History
            </span>
          </li>
        </ul>
      </div>

      {/* Title Section */}
      <div className="mb-6 sm:mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          {player && (
            <div className="flex items-center bg-base-200 px-4 py-2 rounded-lg shadow-sm">
              <span className="text-gray-600 mr-1">Rank</span>
              <span className="text-2xl font-bold text-emerald-600">#{player.playerRank}</span>
              {renderRankChange(player.playerRank, player.previousRank)}
            </div>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent">
          {player ? `${capitalizeFirstLetter(player.name)}'s` : 'Player\'s'} History
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Match history and performance statistics
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
        <div className="stat bg-base-200 rounded-lg shadow-md p-2 sm:p-4">
          <div className="stat-title text-xs sm:text-sm">Games</div>
          <div className="stat-value text-lg sm:text-3xl">{totalEncounters}</div>
        </div>
        <div className="stat bg-base-200 rounded-lg shadow-md p-2 sm:p-4">
          <div className="stat-title text-xs sm:text-sm">Wins</div>
          <div className="stat-value text-lg sm:text-3xl text-success">{wins}</div>
        </div>
        <div className="stat bg-base-200 rounded-lg shadow-md p-2 sm:p-4">
          <div className="stat-title text-xs sm:text-sm">Losses</div>
          <div className="stat-value text-lg sm:text-3xl text-error">{losses}</div>
        </div>
        <div className="stat bg-base-200 rounded-lg shadow-md p-2 sm:p-4">
          <div className="stat-title text-xs sm:text-sm">Win Rate</div>
          <div className="stat-value text-lg sm:text-3xl">{winRate}%</div>
        </div>
      </div>

      {/* Encounters by Date */}
      <div className="space-y-2">
        {Object.entries(encountersByDate).map(([date, encounters], idx) => (
          <Disclosure
            key={date}
            as='div'
            className='rounded-lg overflow-hidden'
            defaultOpen={idx === 0}
          >
            {({ open }) => (
              <>
                <Disclosure.Button className='flex justify-between w-full px-4 py-3 text-sm font-medium text-left bg-base-200 hover:bg-base-300 transition-colors duration-150 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500 focus-visible:ring-opacity-75'>
                  <span className='font-semibold'>{date}</span>
                  <div className="flex items-center space-x-4">
                    {open && renderSum(scoreSumByDate[date])}
                    <ChevronUpIcon
                      className={`${
                        open ? 'transform rotate-180' : ''
                      } w-5 h-5 text-gray-500 transition-transform duration-150`}
                    />
                  </div>
                </Disclosure.Button>
                <Disclosure.Panel className='bg-base-100 shadow-inner'>
                  <div className='overflow-x-auto'>
                    {/* Desktop Table View */}
                    <table className='table w-full hidden md:table'>
                      <thead className='bg-base-200'>
                        <tr>
                          <th className='font-semibold'>Date</th>
                          <th className='font-semibold text-center'>Team 1</th>
                          <th className='font-semibold text-center'>Score</th>
                          <th className='font-semibold text-center'>Team 2</th>
                          <th className='font-semibold text-center'>Result</th>
                          <th className='font-semibold'>Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {encounters.map((encounter) => renderTableRow(encounter))}
                      </tbody>
                    </table>
                    {/* Mobile View */}
                    <div className='md:hidden'>
                      {encounters.map((encounter) => (
                        <PlayerEncounterComponent
                          key={encounter.encounterId}
                          encounter={encounter}
                        />
                      ))}
                    </div>
                  </div>
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
        ))}
      </div>
    </div>
  );
};

export default PlayerEncountersCompactComponent;
