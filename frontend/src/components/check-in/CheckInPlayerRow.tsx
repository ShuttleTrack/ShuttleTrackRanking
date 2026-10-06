import React from 'react';
import Image from 'next/image';
import { publicDisplayName } from '@/utils/string';
import { formatVoteTimeAmsterdam } from '@/lib/check-in/schedule';
import { DEFAULT_TIMEZONE } from '@/lib/gameDay/clock';
import type { RosterPlayer } from '@/lib/check-in/types';

interface CheckInPlayerRowProps {
  player: Pick<RosterPlayer, 'id' | 'name' | 'colorHex' | 'votedAt'>;
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
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate font-headline text-sm font-semibold">
          {publicDisplayName(player.name)}
        </span>
        {isCurrentUser ? (
          <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-wide text-primary">
            You
          </span>
        ) : null}
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
          {badge}
        </span>
      ) : null}
      {player.votedAt ? (
        <span
          className="shrink-0 font-numeric text-xs tabular-nums opacity-80"
          title={`Voted (${DEFAULT_TIMEZONE})`}
        >
          {formatVoteTimeAmsterdam(player.votedAt)}
        </span>
      ) : null}
    </li>
  );
}
