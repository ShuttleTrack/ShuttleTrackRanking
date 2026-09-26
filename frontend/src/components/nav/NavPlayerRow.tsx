import { publicDisplayName } from '@/utils/string';
import type { Player } from '@/types/player';

export function NavPlayerRow({ player }: { player: Player }) {
  return (
    <>
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/10"
        style={{ backgroundColor: `#${player.colorHex}` }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 font-headline text-sm font-semibold truncate">
        {publicDisplayName(player.name)}
      </span>
      {player.playerRank > 0 ? (
        <span className="font-numeric text-xs tabular-nums opacity-80 shrink-0">
          #{String(player.playerRank).padStart(2, '0')}
        </span>
      ) : (
        <span className="w-8 shrink-0" aria-hidden />
      )}
    </>
  );
}
