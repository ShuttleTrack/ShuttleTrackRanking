import Link from 'next/link';
import type { Encounter, EncounterPlayer } from '@/types/encounter';
import { capitalizeFirstLetter } from '@/utils/string';
import ScoreBreakdownPills from '@/components/ScoreBreakdownPills';
import { ENCOUNTER_DESKTOP_GRID } from './encounterGrid';
import { useSquad } from '@/contexts/SquadContext';

interface EncounterCardProps {
  encounter: Encounter;
}

function TeamNames({
  team,
  muted = false,
  compact = false,
}: {
  team: EncounterPlayer[];
  muted?: boolean;
  compact?: boolean;
}) {
  const { slug } = useSquad();
  const sizeClass = compact ? 'text-xs' : 'text-sm sm:text-base';
  return (
    <span className={`${sizeClass} ${muted ? 'text-on-surface-variant' : 'text-on-surface'}`}>
      {team.map((player, index) => (
        <span key={player.playerId}>
          {index > 0 ? ', ' : ''}
          <Link
            href={`/s/${slug}/player/${player.playerId}/encounters`}
            className="font-headline font-semibold hover:underline hover:text-primary"
          >
            {capitalizeFirstLetter(player.playerName)}
          </Link>
        </span>
      ))}
    </span>
  );
}

function ResultBadge({ isWin }: { isWin: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-md flex-shrink-0 font-numeric text-sm tracking-tight ${
        isWin ? 'bg-primary text-black' : 'bg-red-600 text-white'
      }`}
      aria-label={isWin ? 'Won' : 'Lost'}
    >
      {isWin ? 'W' : 'L'}
    </span>
  );
}

function pointsClass(score: number): string {
  if (score > 0) return 'text-primary';
  if (score < 0) return 'text-red-400';
  return 'text-on-surface-variant opacity-60';
}

function formatPoints(score: number): string {
  if (score === 0) return '0.0';
  const sign = score > 0 ? '+' : '';
  return `${sign}${score.toFixed(1)}`;
}

const EncounterCard = ({ encounter }: EncounterCardProps) => {
  const isWin = encounter.playerTeamPoints > encounter.opponentTeamPoints;
  const borderHover = isWin
    ? 'border-l-primary hover:border-primary/40'
    : 'border-l-red-400 hover:border-red-500/20';
  return (
    <article
      className={`rounded-xl bg-surface-container/90 border border-gray-600 border-l-2 px-3 py-1.5 sm:px-4 sm:py-3 transition-all duration-300 ${borderHover}`}
    >
      {/* Mobile: scoreboard first, then W/L + points */}
      <div className="md:hidden space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 text-left truncate whitespace-nowrap">
            <TeamNames team={encounter.playerTeam} compact />
          </span>
          <span className="font-numeric text-on-surface flex-shrink-0 whitespace-nowrap tabular-nums text-base px-0.5">
            {encounter.playerTeamPoints}–{encounter.opponentTeamPoints}
          </span>
          <span className="min-w-0 flex-1 text-right truncate whitespace-nowrap">
            <TeamNames team={encounter.opponentTeam} muted compact />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <ResultBadge isWin={isWin} />
            <ScoreBreakdownPills
              breakdown={encounter.scoreBreakdown}
              groupIndex={encounter.groupIndex}
              totalGroups={encounter.totalGroups}
              align="start"
            />
          </div>
          <span className={`font-numeric text-sm tabular-nums flex-shrink-0 ${pointsClass(encounter.encounterScore)}`}>
            {formatPoints(encounter.encounterScore)}
          </span>
        </div>
      </div>

      {/* Desktop */}
      <div className={`hidden md:grid ${ENCOUNTER_DESKTOP_GRID}`}>
        <div className="min-w-0">
          <TeamNames team={encounter.playerTeam} />
        </div>
        <div className="text-center font-numeric tabular-nums text-lg text-on-surface whitespace-nowrap">
          {encounter.playerTeamPoints} - {encounter.opponentTeamPoints}
        </div>
        <div className="min-w-0">
          <TeamNames team={encounter.opponentTeam} />
        </div>
        <div className="flex justify-center">
          <ResultBadge isWin={isWin} />
        </div>
        <div className="flex items-center justify-end gap-1.5 flex-nowrap min-w-0">
          <ScoreBreakdownPills
            breakdown={encounter.scoreBreakdown}
            groupIndex={encounter.groupIndex}
            totalGroups={encounter.totalGroups}
            align="end"
            className="flex-nowrap shrink-0"
          />
          <span className={`font-numeric tabular-nums text-base whitespace-nowrap shrink-0 ${pointsClass(encounter.encounterScore)}`}>
            {formatPoints(encounter.encounterScore)}
          </span>
        </div>
      </div>
    </article>
  );
};

export default EncounterCard;
