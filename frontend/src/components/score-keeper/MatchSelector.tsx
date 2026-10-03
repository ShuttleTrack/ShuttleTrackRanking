import { SelectedMatch } from '@/types/score-keeper';
import { publicDisplayName } from '@/utils/string';

interface MatchSelectorProps {
  groupName: string;
  matchIndex: number;
  team1: string[];
  team2: string[];
  isSelected: boolean;
  onSelect: (match: SelectedMatch) => void;
}

export const MatchSelector = ({
  groupName,
  matchIndex,
  team1,
  team2,
  isSelected,
  onSelect,
}: MatchSelectorProps) => (
  <div
    className={`p-4 rounded-lg border transition-colors duration-150 cursor-pointer ${
      isSelected
        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
        : 'border-gray-200 hover:border-emerald-500'
    }`}
    onClick={() => onSelect({ groupName, matchIndex, team1, team2 })}
  >
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Match {matchIndex + 1}</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-sm">
          {team1.map((player) => publicDisplayName(player)).join(' & ')}
        </div>
        <div className="text-xs text-gray-500">vs</div>
        <div className="text-sm">
          {team2.map((player) => publicDisplayName(player)).join(' & ')}
        </div>
      </div>
    </div>
  </div>
); 