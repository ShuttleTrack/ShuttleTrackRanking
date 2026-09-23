// The two numbers of the feature (ATTENDANCE_VOTE_PLAN.md, Decision 6). An earlier draft
// collapsed them into one and double-counted; every piece of arithmetic downstream depends on
// which one is meant, so they live in one pure function.
//
//   slotsHeld   = IN votes by structural holders (inherited reservations included)
//               + ASSIGNED open slots (voted or not)
//     -> governs how many more people may be let in (the vacancy sync).
//
//   confirmedIn = IN votes the voter cast themselves (inheritedFromPlayerId null)
//     -> what the 09:00 minimum check compares, what the roster shows, what the planner
//        pre-ticks.
//
// slotsHeld >= confirmedIn always; the difference is exactly the people holding a slot without
// having confirmed - unconfirmed assignees, plus inherited reservations from a post-deadline
// transfer.
import type { GameDayState } from './eligibility';

export interface GameDayCounts {
  slotsHeld: number;
  confirmedIn: number;
  // null when the game day has no minimum (no open-slot flow).
  vacancies: number | null;
  // Holding a slot without having confirmed, split by why.
  unconfirmedAssigneeIds: number[];
  inheritedReservationIds: number[];
}

type CountInputs = Pick<GameDayState, 'structuralHolderIds' | 'assignedIds' | 'voterIds' | 'votes'> & {
  gameDay: { minPlayers: number | null };
};

export function computeGameDayCounts(state: CountInputs): GameDayCounts {
  const { structuralHolderIds, assignedIds, voterIds, votes } = state;

  // The two terms are disjoint by construction - a player is either a structural holder or in
  // the open-slot pool, never both - so this is a clean sum. An assigned player's own IN is NOT
  // counted in the first term, which is what stops them being counted twice.
  const structuralIn = votes.filter((v) => v.choice === 'IN' && structuralHolderIds.has(v.playerId));
  const slotsHeld = structuralIn.length + assignedIds.size;

  // Filtered by the live voter set as well as by the stamp: a vote row left behind by someone
  // who no longer holds a slot (a DISABLED player whose rows were not cleaned up yet) must not
  // read as attendance.
  const confirmedIn = votes.filter(
    (v) => v.choice === 'IN' && v.inheritedFromPlayerId === null && voterIds.has(v.playerId)
  ).length;

  const ownInIds = new Set(votes.filter((v) => v.choice === 'IN' && v.inheritedFromPlayerId === null).map((v) => v.playerId));
  const unconfirmedAssigneeIds = Array.from(assignedIds).filter((id) => !ownInIds.has(id));
  const inheritedReservationIds = structuralIn.filter((v) => v.inheritedFromPlayerId !== null).map((v) => v.playerId);

  const minPlayers = state.gameDay.minPlayers;
  return {
    slotsHeld,
    confirmedIn,
    vacancies: minPlayers === null ? null : Math.max(0, minPlayers - slotsHeld),
    unconfirmedAssigneeIds,
    inheritedReservationIds,
  };
}
