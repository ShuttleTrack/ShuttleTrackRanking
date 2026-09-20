# Player Nominations (Temporary Substitutes) - Plan

Status: **proposed, not implemented**. This is a design for review; implementation starts only
after this is approved.

## Goal

A registered player who'll be away for a stretch can nominate someone else to fill their spot for
that period. The substitute participates in ranked play while active - their own score, visible
on the ranking list and the ranking-history graph, subject to absentee demerits - without being
folded into the permanent roster. Once their window ends they disappear from the active ranking
list again. The original player is not selectable for game days during that window, even if their
own status is otherwise ACTIVE.

## Data model

Two things, deliberately kept separate:

1. **`PlayerNomination`** (new table) - the nomination request/record itself. Per the requirement
   that this not be folded into `Player`, it's a standalone table:
   ```prisma
   model PlayerNomination {
     id            Int       @id @default(autoincrement())
     squadId       Int
     nominatedById Int       // Player.id of the absent original player
     name          String    // nominee's name, as submitted
     email         String    // nominee's email, as submitted
     startDate     DateTime  @db.Date
     endDate       DateTime  @db.Date
     cancelledAt   DateTime? // early cancellation, history preserved
     createdAt     DateTime  @default(now())
     updatedAt     DateTime  @updatedAt

     squad       Squad  @relation(fields: [squadId], references: [id])
     nominatedBy Player @relation("NominatedBy", fields: [nominatedById], references: [id])
     player      Player? @relation("NomineePlayer")

     @@index([squadId])
     @@index([nominatedById])
   }
   ```
2. **`Player`** gains one new nullable field: `nominationId Int? @unique` (+ relation) - **which
   nomination this row is *currently* the ranking participant for**, not a permanent birth-link.
   Because `Player.email` is already unique per squad (`@@unique([squadId, email])`, from the
   multi-squad migration), the same nominee can only ever have **one** `Player` row per squad,
   full stop - a second nomination for the same email reuses that row and repoints `nominationId`
   at the new nomination rather than creating another one (see "Same nominee, reused" below).

## Why a linked `Player` row, not a fully separate ranking track

The requirement is explicit that nominations shouldn't be stored in the main player table, but the
described behavior - own score, appears on the ranking list and the history graph, absentee
demerits while active - is *exactly* what a `Player` row already gives you, end to end. Three
pieces of existing machinery this project has deliberately never duplicated:

- **`lib/ranking/eloCalculator.ts` + `scorePersister.calculateAndPersistElo`**: every match's Elo
  update is computed and written against `Player` rows looked up by the ids encoded in
  `Encounter.team1`/`team2`. For a nominee's matches to produce a rank score at all, their id
  needs to resolve through that exact same lookup - there's no separate "compute Elo for a
  non-Player participant" path, and building one would mean re-deriving this calculator's
  team-average/tier-adjustment logic a second time.
- **`ScoreHistory`**: every rank-score change (a match, an absentee deduction, activation) is a
  row keyed by `playerId`, and it's the *only* source the ranking-history graph reads from. A
  nominee's graph line only exists if something is writing rows with their `playerId` into this
  table the normal way - no parallel history table, no separate renderer.
- **`scorePersister.activatePlayer` / `deactivatePlayer`**: already implement exactly "bring a
  dormant player back with a fresh starting score" and "retire a player, freezing their score" -
  precisely what a nominee needs at the start/end of each stint.

Duplicating any of these for a second entity type would be a much larger, riskier build than this
feature needs, and would put nominee ranking math on a code path this project's characterization
testing doesn't cover.

**The reconciliation**: the nomination *request* is the separate table (who nominated whom, the
name/email as submitted, the date window, cancellation) - nothing about a nomination's existence
touches `Player`. Only once a nominee actually needs to participate (an admin includes them in a
game day) does the system materialize a real, ordinary `Player` row for them, tagged via
`nominationId`. Every match, Elo update, and absentee check downstream then runs through the exact
same code path a regular player's does - zero changes to the pure ranking math.

## Materialization: lazy, at Game Planner's actual commit step

A nomination is created (and validated) up front, but **no `Player` row exists yet**. Game
Planner's player-selection grid is a browsing/toggling surface - the real commit action is the
**"Create Game Day"** button (`ActionPanel.tsx`'s `onCreateGame`), not each individual card click.
Prompting for a starting score on every toggle would be disruptive, so materialization happens at
that commit step instead:

- `getAvailablePlayersForGame(squadId)` returns two kinds of entries for a squad with active
  (today-covering, uncancelled) nominations. The split is per-nomination, not per-email:
  - Already activated for the current nomination (`Player.nominationId` = this nomination's id) -
    a normal entry, indistinguishable from a regular player to the rest of the pipeline.
  - Not yet activated for the current nomination (whether this email is a first-timer with no
    `Player` row at all, or a returning nominee whose existing row is still `DISABLED` and
    pointing at an old nomination) - rendered as pickable but visually distinct ("not yet
    activated").
  - The original nominator's `Player` row is excluded entirely whenever a nomination covering
    today is active and not cancelled.
- Game Planner's local selection state splits accordingly: real `Player` ids in the existing
  `selectedPlayers` array, plus a new `selectedPendingNominationIds` array for toggled-but-not-yet
  -materialized nominees. Toggling either is free, no network call.
- Clicking **"Create Game Day"**, if any pending nominations are selected, shows **one** combined
  "starting scores" form - a row per pending nominee (name + score input, prefilled where
  possible, independently editable) - not a sequence of one-at-a-time prompts.
- Confirming that form submits everything in **one** request,
  `POST /api/squads/[squadId]/nominations/activate-batch`, wrapped in a single transaction
  (all-or-nothing). For each activation, the handler looks up the nomination's email against the
  squad's existing roster and branches:
  - **A `Player` row already exists for that email** (a returning nominee): reuse it - repoint
    `nominationId` at the new nomination, then call the existing `activatePlayer(squadId,
    playerId, initialScore)`. No new `Player` row.
  - **No existing row**: create one the same way `addPlayer` does today, plus `nominationId` set.
  The frontend merges the resulting ids into `selectedPlayers` and only then proceeds into the
  existing `handleCreateGameDay` flow unchanged. Cancelling the form aborts game creation with the
  selection intact - nothing is materialized or committed.
- **Score prefill**: if an existing `Player` row was found for that email, prefill with its
  current `rankScore` directly - it's the same row, frozen at whatever it was when last
  deactivated.

## Validation: minimum 3 scheduled match days

`POST /api/squads/[squadId]/nominations` (self-service) validates `startDate`/`endDate` against
the squad's recurrence schedule (`Squad.schedule` - see `frontend/docs/squad-tenancy.md`):

- If the squad has no configured recurring schedule, reject outright - nothing to validate a
  duration against.
- New pure function `countScheduledOccurrences(schedule, startDate, endDate)` (extends
  `lib/squadSchedule.ts`) counts how many `dayOfWeek` occurrences fall within
  `[startDate, endDate] ∩ [schedule.startDate, schedule.endDate ?? endDate]`, excluding
  `schedule.skipDates`. Unit tested the same way `validateScheduleInput` already is.
- Reject with a clear error if the count is under 3.
- Reject if the nominator already has another active, date-overlapping nomination - one
  substitute per absent slot at a time.
- Reject if this email already has another active, date-overlapping nomination in this squad,
  regardless of who submitted it - the same person can't physically cover two slots on the same
  match day. Non-overlapping windows are fine (see "Same nominee, reused").

## Auth

- New `requireSquadPlayer(req, res, squadId)` in `lib/auth.ts`, mirroring `requireSquadAdmin`:
  resolves the session, requires the caller to be a registered `Player` in this squad. Used by
  nomination submission and cancel-own-nomination - the first player-only (non-admin) API gate in
  the app.
- `nominatedById` is always resolved server-side from the caller's own `Player` row, never taken
  from the request body - a player can only nominate a substitute for themselves.
- Activating a nomination and cancelling *any* nomination stays `requireSquadAdmin` - only the
  nominator can cancel their own (checked in-handler), or a squad admin can cancel anyone's.

## What happens when a nomination expires

Two mechanisms, because they solve two different correctness problems:

1. **Immediate, lazy, every request** - plain date comparison, no write needed. Anywhere the code
   decides who's eligible right now, it compares against `nomination.endDate` directly:
   - `getAvailablePlayersForGame`: a nominee past `endDate` is no longer offered for a new game
     day, and the original nominator reappears automatically - the exclusion rule is simply
     "exclude the nominator while an active nomination covers today," so once that stops being
     true there's nothing else to do.
   - The absentee-candidate set in `processEncountersForDate` excludes a nominee past `endDate`
     ("not after their time is done"), and excludes the nominator while their nomination is
     active (they didn't skip - someone was covering).
2. **Eager, triggered by the next processed game day** - an actual `playerStatus` flip, reusing
   existing machinery. Relying on lazy filtering alone for the *public ranking list* has a real
   bug: `updatePlayerRanking()` computes sequential rank numbers over players whose status is
   `ACTIVE`, with no awareness of nominations. If an expired nominee's row is still `ACTIVE`,
   visible players sorted after them get rank numbers with a gap. Fix: at the start of
   `processEncountersForDate`, before the absentee sweep, call the existing `deactivatePlayer`
   for every nominee-linked player whose `endDate` has passed and who's still `ACTIVE` - the same
   function already used to retire any player. Once that's done, every existing status-based code
   path (ranking list, leaderboard, rank numbering) already does the right thing with no further
   changes.
   - This means expiry is only *fully* reflected on the public ranking list the next time that
     squad's game day is processed, not the instant `endDate` passes - a short, bounded staleness
     window (same cadence as the squad's own match schedule). Flagged explicitly: if same-day
     accuracy turns out to matter, `getPlayers` could get the same lazy `endDate` check as (1)
     above too - cheap to add later.

The ranking-history graph needs no rendering changes: a nominee's `ScoreHistory` rows only ever
exist for the dates their `Player` row was active, so their line already only appears for that
span once they're excluded from the active list - worth verifying against the chart component
during implementation rather than assuming, since this exact appear/disappear case is new.

## Same nominee (email), reused

**One `Player` row per email per squad, reused across every stint** - not one row per nomination.
This isn't just tidiness: `Player.email` is already unique per squad, so creating a second row for
an email that already has one would fail outright regardless of preference here. A nominee who
substitutes multiple times keeps the same `Player.id` every time; only `nominationId` changes.

- Different nominators, non-overlapping windows (e.g. covers for Alice in March, then Bob in
  June): allowed. Two independent `PlayerNomination` rows, one `Player` row throughout -
  deactivated at the end of March, reactivated (prefilled from the March-ending score) in June,
  `nominationId` moved from one nomination to the other.
- Overlapping windows, same or different nominators: rejected at submission time (see
  Validation).
- Because it's the same `Player.id` the whole time, `ScoreHistory` accumulates on one continuous
  timeline across every stint, with real gaps exactly on the days they weren't active - a better
  fit for "shown on the days they were in the squad, empty when not" than separate rows per stint
  would have been.
- Nothing about *who nominated them* carries across stints - `PlayerNomination` history is queried
  directly by squad + email, not through the `Player` row (since `nominationId` only ever points
  at the current/most recent one).

## UI

- New player-facing page, e.g. `pages/s/[squad]/user/nominate.tsx` (gated the same way as
  `matches.tsx`/`profile.tsx`): a form (name, email, start date, end date) plus the player's own
  past/active nominations with a cancel action.
- `pages/s/[squad]/admin/game-planner.tsx`: pending nominations render in the player-selection
  grid alongside real players, visually flagged, freely toggleable. The starting-score step
  happens once, as a batch, when "Create Game Day" is clicked - not per card click.
- A lightweight "active nominations" list for squad admins - proposed on
  `pages/s/[squad]/admin/players.tsx` (visibility into who's currently substituted for whom), with
  a cancel action there too.

## Open judgment calls

- Exact placement of the admin-side "active nominations" list (dashboard vs. players page) -
  defaulting to the players page since that's already the roster-management surface.
- A cancelled-early nominee's already-materialized `Player` row: cancellation is an explicit API
  call, so the cancel endpoint calls `deactivatePlayer` synchronously right then - no lazy-vs-eager
  gap to accept, unlike a passive `endDate` passing.

## Verification plan

- Unit tests: `countScheduledOccurrences` (boundary cases - exactly 3, exactly 2, skip-dates
  pushing the count below 3, a range partially outside the schedule's own validity window) and
  the nomination-input validation (no schedule configured, overlapping nomination).
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Manual smoke test: configure a squad's recurring schedule, submit a nomination covering exactly
  2 match days (expect rejection) and exactly 3 (expect success), activate it via Game Planner
  with a starting score, run a full game day, confirm the original nominator is absent from
  selection and unaffected by absentee deductions, confirm the nominee *does* incur an absentee
  deduction if skipped on a later scheduled day within their window and does *not* after
  `endDate`, confirm ranking-list/leaderboard/graph show the nominee only across their active
  window.
- Expiry-specific: let a nomination's `endDate` pass, confirm the nominator is immediately
  selectable again, confirm the expired nominee still shows on the public ranking list until the
  next processed game day for that squad, then confirm they're gone with no rank-number gap once
  processed.
- Repeat-nomination: two different players both submit a nomination for the same nominee email
  with overlapping dates (expect the second rejected); the same email nominated again for a
  non-overlapping window after the first expires (expect success, score prefilled from the first
  stint's ending score, same `Player.id` reused, one continuous graph timeline with a gap between
  stints); cancel an active, already-materialized nomination and confirm the nominee disappears
  immediately.
