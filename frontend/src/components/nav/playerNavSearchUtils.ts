import type { Player } from '@/types/player';

export function sortPlayersByName(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterPlayersByQuery(players: Player[], query: string): Player[] {
  const q = query.trim().toLowerCase();
  if (!q) return players;
  return players.filter((p) => p.name.toLowerCase().includes(q));
}
