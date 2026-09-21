export type CheckInVote = 'IN' | 'OUT';

export type GameDayWeekday = 'WEDNESDAY' | 'FRIDAY';

export interface GameDay {
  id: string;
  weekday: GameDayWeekday;
  date: string;
  startTime: string;
  endTime: string;
  timezone: 'Europe/Amsterdam';
}

export type SessionPhase = 'upcoming' | 'live' | 'ended';

export interface CheckInState {
  gameDay: GameDay;
  myVote: CheckInVote | null;
  inPlayers: import('@/types/player').Player[];
  outPlayers: import('@/types/player').Player[];
}
