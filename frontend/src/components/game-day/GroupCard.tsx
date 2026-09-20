import { Player } from '@/types/player';
import { capitalizeFirstLetter } from '@/utils/string';

interface GroupCardProps {
  groupName: string;
  players: Player[];
}

export const GroupCard = ({ groupName, players }: GroupCardProps) => (
  <div className="rounded-xl bg-surface-container/90 border border-gray-600 p-4">
    <h2 className="font-headline font-semibold text-on-surface mb-3 pb-2 border-b border-gray-600">
      {groupName}
      <span className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-2">
        ({players.length} players)
      </span>
    </h2>
    <div className="space-y-0">
      {players.map((player, index) => (
        <div
          key={player.id}
          className={`flex items-center justify-between py-2 ${
            index !== players.length - 1 ? 'border-b border-gray-600/50' : ''
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-headline text-sm font-medium text-on-surface truncate">
              {capitalizeFirstLetter(player.name)}
            </span>
            <span className="text-xs text-on-surface-variant shrink-0">
              (#{player.playerRank ? player.playerRank : 'N/A'})
            </span>
          </div>
          <span className="font-numeric tabular-nums text-sm text-on-surface-variant shrink-0">
            {player.rankScore ? player.rankScore.toFixed(1) : 'N/A'}
          </span>
        </div>
      ))}
    </div>
  </div>
);
