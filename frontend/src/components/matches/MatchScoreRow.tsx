import type { CSSProperties } from 'react';
import {
  MATCH_RESULT_LOSS,
  MATCH_RESULT_LOSS_TINT,
  MATCH_RESULT_WIN,
  MATCH_RESULT_WIN_TINT,
} from '@/constants/matchResultColors';
import { capitalizeFirstLetter } from '@/utils/string';

export interface MatchScoreRowProps {
  team1: string[];
  team2: string[];
  team1Score: number;
  team2Score: number;
  interactive?: boolean;
  onActivate?: () => void;
  /** When false, W/L chips are hidden (e.g. game viewer with a page legend). Default true for score keeper. */
  showResultChips?: boolean;
  /** Tighter padding for game viewer on mobile. Default false. */
  compact?: boolean;
}

function teamBoxStyle(won: boolean, played: boolean): CSSProperties | undefined {
  if (!played) return undefined;
  return { background: won ? MATCH_RESULT_WIN_TINT : MATCH_RESULT_LOSS_TINT };
}

function ResultChip({ won }: { won: boolean }) {
  return (
    <span
      className={`flex shrink-0 self-center items-center justify-center min-w-[1.25rem] h-5 px-1 rounded text-xs font-bold ${
        won ? 'text-black' : 'text-white'
      }`}
      style={{ background: won ? MATCH_RESULT_WIN : MATCH_RESULT_LOSS }}
    >
      {won ? 'W' : 'L'}
    </span>
  );
}

const MatchScoreRow = ({
  team1,
  team2,
  team1Score,
  team2Score,
  interactive = false,
  onActivate,
  showResultChips = true,
  compact = false,
}: MatchScoreRowProps) => {
  const isPlayed = team1Score > 0 || team2Score > 0;
  const team1Won = isPlayed && team1Score > team2Score;
  const team2Won = isPlayed && team2Score > team1Score;
  const nameClass = showResultChips
    ? 'text-xs font-headline font-medium text-on-surface'
    : 'text-sm font-headline font-medium text-on-surface';

  const outerClass = `rounded-xl border border-gray-600 bg-surface-container transition-colors ${
    compact ? 'p-1.5' : 'p-3'
  } ${interactive ? 'cursor-pointer hover:border-primary/40' : ''}`;

  const teamPad = compact ? 'p-1' : 'p-2';
  const scoreClass = compact
    ? 'font-numeric font-bold text-base sm:text-lg text-on-surface tabular-nums'
    : 'font-numeric font-bold text-lg text-on-surface tabular-nums';

  const renderTeam = (players: string[], won: boolean) => (
    <div
      className={`flex items-center justify-center gap-2 rounded-lg ${teamPad} ${
        isPlayed ? '' : 'bg-surface-container-high'
      }`}
      style={teamBoxStyle(won, isPlayed)}
    >
      {showResultChips && isPlayed && <ResultChip won={won} />}
      <div className="flex flex-col items-center min-w-0">
        <div className={nameClass}>{capitalizeFirstLetter(players[0])}</div>
        <div className={nameClass}>{capitalizeFirstLetter(players[1])}</div>
      </div>
    </div>
  );

  const content = (
    <div className="grid grid-cols-11 gap-2 items-center">
      <div className="col-span-4">{renderTeam(team1, team1Won)}</div>
      <div className="col-span-3 text-center">
        <div className={scoreClass}>
          {team1Score} - {team2Score}
        </div>
      </div>
      <div className="col-span-4">{renderTeam(team2, team2Won)}</div>
    </div>
  );

  if (interactive && onActivate) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={outerClass}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
      >
        {content}
      </div>
    );
  }

  return <div className={outerClass}>{content}</div>;
};

export default MatchScoreRow;
