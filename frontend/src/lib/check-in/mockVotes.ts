import type { Player } from '@/types/player';
import type { CheckInVote } from './types';

function deterministicVote(playerId: number, uid: string): CheckInVote {
  let hash = 0;
  const key = `${playerId}:${uid}`;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return (hash & 1) === 0 ? 'IN' : 'OUT';
}

function sortByRank(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const rankA = a.playerRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.playerRank ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

export interface RosterSplit {
  inPlayers: Player[];
  outPlayers: Player[];
}

/**
 * Builds In/Out lists from the real player roster. Other players' votes are mocked deterministically.
 * Rosters stay empty until `myVote` is set (per product spec).
 */
export function buildCheckInRoster(
  players: Player[],
  uid: string,
  currentPlayerId: number | undefined,
  myVote: CheckInVote | null
): RosterSplit {
  if (myVote === null) {
    return { inPlayers: [], outPlayers: [] };
  }

  const inPlayers: Player[] = [];
  const outPlayers: Player[] = [];

  for (const player of players) {
    if (currentPlayerId !== undefined && player.id === currentPlayerId) {
      if (myVote === 'IN') inPlayers.push(player);
      else outPlayers.push(player);
      continue;
    }

    const vote = deterministicVote(player.id, uid);
    if (vote === 'IN') inPlayers.push(player);
    else outPlayers.push(player);
  }

  return {
    inPlayers: sortByRank(inPlayers),
    outPlayers: sortByRank(outPlayers),
  };
}
