// Wire shapes of the game-day check-in API (ATTENDANCE_VOTE_PLAN.md), as the player-facing pages
// consume them. Type-only re-exports of the server read models, so the page and the API cannot
// drift - `import type` is erased at compile time, so none of the server code (or Prisma's
// runtime) reaches the client bundle.
export type {
  GameDayRole,
  GameDaySummary,
  GameDayView,
  RosterPlayer,
  UnconfirmedPlayer,
  UpcomingGameDay,
  GameDayAttendance,
} from '@/lib/gameDay/view';
export type { VoteVerdict } from '@/lib/gameDay/votes';

export type CheckInVote = 'IN' | 'OUT';
