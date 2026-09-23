import Image from 'next/image';
import { capitalizeFirstLetter } from '@/utils/string';
import type { RosterPlayer } from '@/lib/check-in/types';

interface CheckInPlayerRowProps {
  player: Pick<RosterPlayer, 'id' | 'name' | 'colorHex' | 'playerRank'>;
  isCurrentUser: boolean;
  avatarUrl?: string;
  staggerIndex?: number;
  // A short marker after the name - "Awaiting confirmation", "Open slot".
  badge?: string;
}

export function CheckInPlayerRow({
  player,
  isCurrentUser,
  avatarUrl,
  staggerIndex = 0,
  badge,
}: CheckInPlayerRowProps) {
  return (
    <li
      className="motion-safe:animate-slideUp flex items-center gap-3 rounded-lg border border-white/5 bg-surface-container-high/40 px-3 py-2.5"
      style={{ animationDelay: `${staggerIndex * 40}ms` }}
    >
      {isCurrentUser && avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover ring-2 ring-primary/50"
        />
      ) : (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/10"
          style={{ backgroundColor: `#${player.colorHex}` }}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1 font-headline text-sm font-semibold truncate">
        {capitalizeFirstLetter(player.name)}
      </span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
          {badge}
        </span>
      ) : null}
      {(player.playerRank ?? 0) > 0 ? (
        <span className="font-numeric text-xs tabular-nums opacity-80 shrink-0">
          #{String(player.playerRank).padStart(2, '0')}
        </span>
      ) : null}
      {isCurrentUser ? (
        <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-wide text-primary">
          You
        </span>
      ) : null}
    </li>
  );
}
