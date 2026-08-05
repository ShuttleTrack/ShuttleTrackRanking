import React from 'react';
import { Encounter, EncounterPlayer } from '@/types/encounter';
import { capitalizeFirstLetter } from '@/utils/string';
import ScoreBreakdownPills from './ScoreBreakdownPills';

interface PlayerEncounterComponentProps {
  encounter: Encounter;
}

const renderTeamList = (team: EncounterPlayer[]) =>
  team
    .map(
      (player, index) =>
        `${capitalizeFirstLetter(player.playerName)}${
          index < team.length - 1 ? ', ' : ''
        }`,
    )
    .join('');

const PlayerEncounterComponent: React.FC<PlayerEncounterComponentProps> = ({
  encounter,
}) => {
  const isWin = encounter.playerTeamPoints > encounter.opponentTeamPoints;
  const scoreColorClass =
    encounter.encounterScore < 0 ? 'text-red-500' : 'text-green-500';

  const determineRowBackground = (
    playerPoints: number,
    opponentPoints: number,
  ) => {
    return playerPoints > opponentPoints ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <span className={`mr-2 flex items-center justify-center w-5 h-5 rounded-full ${
            isWin 
              ? 'bg-emerald-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            {isWin ? '✓' : '×'}
          </span>
          <span>{isWin ? 'Won' : 'Lost'}</span>
        </div>
        <div className="text-right">
          <span
            className={`font-bold ${
              encounter.encounterScore > 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {encounter.encounterScore > 0 ? '+' : '-'}
            {Math.abs(encounter.encounterScore)}
          </span>
          <ScoreBreakdownPills
            breakdown={encounter.scoreBreakdown}
            groupIndex={encounter.groupIndex}
            totalGroups={encounter.totalGroups}
          />
        </div>
      </div>
      <div className='mb-8 overflow-x-auto'>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 items-center text-center'>
          <div className={`font-bold text-lg lg:text-xl ${scoreColorClass}`}>
            Score: {encounter.encounterScore > 0 ? '+' : '-'}
            {Math.abs(encounter.encounterScore)}
          </div>
        </div>
        <table className='table'>
          <thead>
            <tr>
              <th className='px-4 py-2'>Players</th>
              <th className='px-4 py-2'>Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={determineRowBackground(
                encounter.playerTeamPoints,
                encounter.opponentTeamPoints,
              )}>
                {renderTeamList(encounter.playerTeam)}
              </td>
              <td className='border px-4 py-2 text-center'>
                {encounter.playerTeamPoints}
              </td>
            </tr>
            <tr className='bg-gray-100'>
              <td className='border px-4 py-2 text-center' colSpan={2}>
                vs
              </td>
            </tr>
            <tr>
              <td className={determineRowBackground(
                encounter.opponentTeamPoints,
                encounter.playerTeamPoints,
              )}>
                {renderTeamList(encounter.opponentTeam)}
              </td>
              <td className='border px-4 py-2 text-center'>
                {encounter.opponentTeamPoints}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlayerEncounterComponent;
