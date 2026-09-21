import type { CheckInVote } from './types';

export function checkInStorageKey(uid: string, playerId: number): string {
  return `check-in:${uid}:${playerId}`;
}

export function readStoredVote(uid: string, playerId: number): CheckInVote | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(checkInStorageKey(uid, playerId));
  if (raw === 'IN' || raw === 'OUT') return raw;
  return null;
}

export function writeStoredVote(uid: string, playerId: number, vote: CheckInVote): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(checkInStorageKey(uid, playerId), vote);
}
