import { useEffect, useState } from 'react';
import type { CheckInVote, RosterPlayer, UnconfirmedPlayer } from '@/lib/check-in/types';
import { CheckInPlayerRow } from './CheckInPlayerRow';

type RosterTab = 'IN' | 'OUT';

interface CheckInRosterProps {
  inPlayers: RosterPlayer[];
  outPlayers: RosterPlayer[];
  // Holding a slot without having confirmed (ATTENDANCE_VOTE_PLAN.md, Decision 6): an assigned
  // open-slot player who has not voted yet, or a reservation inherited with a transferred slot.
  // Deliberately NOT counted as "in".
  awaitingConfirmation?: UnconfirmedPlayer[];
  waitingCount?: number;
  currentPlayerId?: number;
  avatarUrl?: string;
  myVote?: CheckInVote | null;
  nested?: boolean;
}

function PlayerList({
  players,
  currentPlayerId,
  avatarUrl,
  badgeFor,
}: {
  players: RosterPlayer[];
  currentPlayerId?: number;
  avatarUrl?: string;
  badgeFor?: (player: RosterPlayer) => string | undefined;
}) {
  if (players.length === 0) {
    return <p className="py-6 text-center text-sm text-on-surface-variant">No players yet</p>;
  }

  return (
    <ul className="space-y-2">
      {players.map((player, index) => (
        <CheckInPlayerRow
          key={player.id}
          player={player}
          isCurrentUser={player.id === currentPlayerId}
          avatarUrl={avatarUrl}
          staggerIndex={index}
          badge={badgeFor?.(player)}
        />
      ))}
    </ul>
  );
}

const openSlotBadge = (player: RosterPlayer) => (player.isOpenSlot ? 'Open slot' : undefined);

export function CheckInRoster({
  inPlayers,
  outPlayers,
  awaitingConfirmation = [],
  waitingCount = 0,
  currentPlayerId,
  avatarUrl,
  myVote = null,
  nested = false,
}: CheckInRosterProps) {
  const [tab, setTab] = useState<RosterTab>(myVote ?? 'IN');

  useEffect(() => {
    if (myVote) setTab(myVote);
  }, [myVote]);

  const tabClass = (active: boolean) =>
    active
      ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/40'
      : 'text-on-surface-variant hover:bg-white/5';

  return (
    <section className={`motion-safe:animate-slideUp ${nested ? 'mt-4' : 'mt-8'}`} aria-label="Player votes">
      <h2 className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-80">
        Who&apos;s playing
      </h2>

      <div className="mt-3 flex gap-1 rounded-xl border border-white/5 bg-surface-container/60 p-1 md:hidden">
        <button
          type="button"
          className={`flex-1 rounded-lg py-2.5 font-headline text-sm font-semibold transition-colors ${tabClass(tab === 'IN')}`}
          onClick={() => setTab('IN')}
        >
          In ({inPlayers.length})
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg py-2.5 font-headline text-sm font-semibold transition-colors ${tabClass(tab === 'OUT')}`}
          onClick={() => setTab('OUT')}
        >
          Out ({outPlayers.length})
        </button>
      </div>

      <div className="mt-4 md:mt-3 md:grid md:grid-cols-2 md:gap-6">
        <div className={tab === 'IN' ? 'block' : 'hidden md:block'}>
          <h3 className="mb-2 hidden font-label text-xs font-bold uppercase tracking-widest text-primary md:block">
            In ({inPlayers.length})
          </h3>
          <PlayerList players={inPlayers} currentPlayerId={currentPlayerId} avatarUrl={avatarUrl} badgeFor={openSlotBadge} />
        </div>
        <div className={tab === 'OUT' ? 'block' : 'hidden md:block'}>
          <h3 className="mb-2 hidden font-label text-xs font-bold uppercase tracking-widest text-red-400 md:block">
            Out ({outPlayers.length})
          </h3>
          <PlayerList players={outPlayers} currentPlayerId={currentPlayerId} avatarUrl={avatarUrl} />
        </div>
      </div>

      {awaitingConfirmation.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-2 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Holding a slot · awaiting confirmation ({awaitingConfirmation.length})
          </h3>
          <PlayerList
            players={awaitingConfirmation}
            currentPlayerId={currentPlayerId}
            avatarUrl={avatarUrl}
            badgeFor={(p) => ((p as UnconfirmedPlayer).reason === 'INHERITED' ? 'Slot passed on' : 'Open slot')}
          />
        </div>
      ) : null}

      {waitingCount > 0 ? (
        <p className="mt-4 text-sm text-on-surface-variant">
          {waitingCount} on the open-slot waiting list.
        </p>
      ) : null}
    </section>
  );
}
