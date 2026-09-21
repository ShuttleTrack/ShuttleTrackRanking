import type { GamePlannerPlayer } from '@/hooks/useGamePlayers';
import { capitalizeFirstLetter } from '@/utils/string';

interface PlayerCardProps {
  player: GamePlannerPlayer;
  isSelected: boolean;
  onToggle: (id: number) => void;
}

export const PlayerCard = ({ player, isSelected, onToggle }: PlayerCardProps) => (
  <button
    type="button"
    className={`w-full min-h-[44px] rounded-xl border p-4 text-left transition-colors duration-150 ${
      isSelected
        ? 'border-primary bg-surface-container-high'
        : 'border-gray-600 bg-surface-container hover:border-primary/40'
    }`}
    onClick={() => onToggle(player.id)}
    aria-pressed={isSelected}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-headline font-medium text-on-surface truncate">
          {capitalizeFirstLetter(player.name)}
        </div>
        <div className="text-sm text-on-surface-variant mt-0.5">
          {player.hasScore ? (
            <>
              Rank: <span className="font-numeric tabular-nums">#{player.playerRank}</span>
            </>
          ) : (
            <span className="text-warning font-medium">Needs a score</span>
          )}
        </div>
      </div>
      <div
        className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center ${
          isSelected
            ? 'border-primary bg-primary text-black'
            : 'border-outline-variant bg-transparent'
        }`}
        aria-hidden
      >
        {isSelected && (
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </div>
  </button>
);
