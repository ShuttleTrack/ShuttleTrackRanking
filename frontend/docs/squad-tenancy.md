# Squad tenancy

Reference for the multi-squad tenancy model added to ShuttleTrackRanking: what a "squad" is, how
the data/auth/routing layers are scoped by it, what's shipped vs. still a follow-up, and the
history of how production was migrated onto it. Read this before touching anything squad-related
- **keep it updated**: any PR that changes squad data model, auth, routing, or squad-level
features should add a section (or amend an existing one) here in the same PR. See the rule in
`CLAUDE.md`.

## Why

The app used to support exactly one friend group: `Player`/`Encounter`/`Game` were global tables
and "admin" was a single flat `ALLOWED_ADMIN_EMAILS` env var. A **squad** is now an independent
tenant - its own roster, game days, and ranking board - so multiple friend groups can share one
deployment instead of each needing a separate one. (One such separate deployment already existed
- `apl-aragorn-duckdns`, a different GHCR image/tag/environment building the same codebase for a
different group - folding that into this squad model is a possible future move, not done.)

The original design discussion and rollout plan lived in a docs PR (`SQUAD_TENANCY_PLAN.md` on
branch `docs/squad-tenancy-plan`) and a shareable doc; this file is the living reference that
supersedes those now that the feature is built and in production.

## Data model

- **`Squad`** (`prisma/schema.prisma`) - the tenant. `id`, `name`, `slug` (unique, used in URLs),
  `enabled`, `maxPlayers` (nullable = unlimited), `isPublic` (default `true` — feeds the
  site-root public leaderboard; see below), plus `schedule` (a single JSON blob for the recurrence
  schedule - see below).
  Frontend-owned, like `Game` - not part of the original Java backend's schema.
- **`SquadAdmin`** - join table (`squadId`, `email`) granting admin rights scoped to one squad.
  Keyed by email (lowercased), not a numeric user id - matches how this app already resolves
  identity (Google-verified email), no separate `User` table.
- **`Player`**, **`Encounter`**, **`Game`** all gained a `squadId` FK. `Player.email` moved from
  optional to required - it's the only link between a login and a role in a squad, and the same
  email can now have one `Player` row per squad (independently ranked in each).
  - `Encounter`/`Game` need `squadId` as a *direct* column (not derived via a join) because
    `team1`/`team2`/`groups`/`scores` are opaque encoded-player-id strings/JSON, not FK-joinable.
  - `ScoreHistory` is **unchanged** - always queried by `playerId`, which already pins a squad
    once `Player` is squad-scoped, so no denormalized `squadId` needed there.
- **Recurrence schedule** (on `Squad`, one JSON blob - see "Squad schedule" below):
  `isRecurring`, `scheduleDayOfWeek` (`DayOfWeek` enum), `scheduleStartTime`/`scheduleEndTime`
  (`"HH:mm"` strings), `scheduleStartDate`/`scheduleEndDate` (recurrence validity window, end
  nullable = ongoing), `scheduleSkipDates` (JSON array of `"YYYY-MM-DD"` strings, holidays etc.),
  `scheduleTimezone` (IANA zone the times are in).
- **`Player.playerType`** (`FULLTIME` default / `OPEN_SLOT`) and **`SlotReplacement`** - see
  "Open-slot & replacement players" below.
- **`GameDay`**, **`GameDayVote`**, **`GameDayOpenSlot`**, `Squad.gameDayOps` and
  `Game.gameDayId` - see "Game day check-in & attendance vote" below.

## Auth & access model

Google SSO itself is untouched. What changed is what "admin" means - no longer a single global
flag:

- `ALLOWED_ADMIN_EMAILS` is now the **platform-superadmin** list (`session.user.isSuperAdmin`):
  can create squads, assign/remove any squad's admins, edit `enabled`/`maxPlayers`, and is
  implicitly an admin of every squad.
- `SquadAdmin` rows grant admin rights scoped to one squad - the day-to-day equivalent of the old
  global admin flag, per-tenant.
- Access is resolved **per request, per squad**, not cached on the session:
  `lib/auth/squadAccess.ts`'s `getSquadAccess(email, squadId)` looks up `SquadAdmin` and `Player`
  scoped to that one squad. The same person can be an admin in squad A and a plain player (or
  nobody) in squad B.
- API-route gates (`lib/auth.ts`): `requireSquadAdmin(req, res, squadId)`,
  `requireSuperAdmin(req, res)`. These replaced the old single `requireAuth`.
  `requireSquadMember(req, res, squadId)` is the member-level gate: "signed in and connected to
  this squad somehow" - a `Player` row **or** admin rights. It returns the resolved `player` and
  deliberately does **not** guarantee one (an admin with no `Player` row passes), so a route that
  acts *as a player* checks `player` itself. The five routes that used to inline this check
  (`replacements/index`, `replacements/preview`, `players/open-slot`, `games/my-matches`,
  `user/scores`) now use it with unchanged behaviour, as do the new game-day routes.
- Page-level gates (`lib/squadPage.ts`, used in `getServerSideProps`):
  `resolveSquadOrNotFound` (public pages - 404s a missing/disabled squad, and if signed in also
  resolves `isSquadAdmin`/`isPlayerHere` purely so nav links can reflect it),
  `resolveSquadAdminOrRedirect` (admin pages - redirects to `/login?callbackUrl=<this page>` or
  the squad root),
  `resolveSquadUserOrRedirect` (user pages - also returns the caller's `playerId` in *this*
  squad, since a static session-wide `playerId` no longer makes sense once one person can have a
  different `Player` row per squad). Both redirect a signed-out request to
  `/login?callbackUrl=<this page>` (`loginRedirectFor`), so a shared link - the game-day vote
  posted to Telegram - lands back where it pointed after sign-in. The redirect is server-side,
  before any client hook runs; `useRequireUser` carries the same `callbackUrl` for client-side
  session expiry.
- `SquadContext` (`contexts/SquadContext.tsx`) - React context carrying `{ id, slug, name,
  isSquadAdmin, isPlayerHere }`. `_app.tsx` sets it up from the page's `squad` prop (pulled out of
  `pageProps` before `<Layout>`, so the global nav - which renders outside any single page's own
  render tree - can see it too). `useSquad()` throws outside a provider (every squad-scoped page
  must supply one); `useOptionalSquad()` doesn't, for nav components shared with non-squad pages
  (squad picker, login, platform admin).

## Routing

- **Public** (no login): `/s/[squad]/{index,encounter-history,game-viewer,player-ranking-history,player/[id]/encounters}`.
- **User** (signed-in + registered player in that squad): `/s/[squad]/user/{profile,matches,management}`.
- **User**, continued: `/s/[squad]/user/replacement` - self-service replacement nomination (see
  "Open-slot & replacement players" below).
- **User**, continued: `/s/[squad]/game-day/[date]` (`YYYY-MM-DD`) - the game-day check-in page
  (see "Game day check-in & attendance vote" below). Gated by `resolveSquadUserOrRedirect`; a
  superadmin with no `Player` row gets a read-only observer view.
- **Admin** (signed-in + squad admin, or superadmin): `/s/[squad]/admin/{dashboard,game-day,game-planner,players,score-keeper,settings}`.
- **Platform** (superadmin only): `/platform/squads` - create squads, manage each squad's admins,
  edit `enabled`/`maxPlayers`.
- **`/`** - **public aggregate leaderboard** (no login). Merges active ranked players from every
  `enabled` + `isPublic` squad into one row per email; `rankScore` values are **summed** across
  that person's public memberships. Narrower columns than the per-squad board (no peak tenure,
  last-day net, or trend). Rows are **not** clickable — a callout directs visitors to sign in and
  pick a squad for detailed rankings and encounter history. Per-squad boards at `/s/[slug]` still
  link rows to player encounters as before.
- **`/squads`** - signed-in squad picker (fallback). Resolves the email's squads server-side and
  redirects straight to `/s/{slug}` when there's exactly one — no picker click for the common
  case. Shows the picker for 0 or 2+ squads; a sign-in prompt when signed out. Signed-in users
  with squads normally switch via the **Squads** list in the account menu / mobile menu (`GET
  /api/squads` via `useMySquads()`); the `/squads` page remains for zero-squad users and direct
  navigation.
- **`/login`** - stays global, not squad-scoped.
- **API**: everything under the old flat `/api/{players,games,encounters,rankings,user}/**` moved
  to `/api/squads/[squadId]/**`. Plus **`GET /api/rankings`** (public aggregate board data; no
  auth), `/api/squads` (list mine / create, superadmin-only create),
  `/api/squads/[squadId]` (GET detail incl. schedule fields, squad-admin-readable; PATCH
  `enabled`/`maxPlayers`, superadmin-only), `/api/squads/[squadId]/admins` (superadmin-only),
  `/api/squads/[squadId]/schedule` (PATCH, squad-admin-editable),
  `/api/squads/[squadId]/open-slot-settings` (PATCH, squad-admin-editable),
  `/api/squads/[squadId]/players/{bulk-initial-score,open-slot}`,
  `/api/squads/[squadId]/replacements` (GET own / GET `?scope=squad` squad-admin-only / POST),
  `/replacements/preview` (GET, squad-member-readable), `/replacements/[id]` (PATCH to request
  cancelling or shortening) and `/replacements/[id]/cancellation` (PATCH to approve/reject a
  pending request, squad-admin-only) - see "Open-slot & replacement players" below for all of
  these. `/api/squads/[squadId]/game-days` (GET), `/game-days/[date]` (GET),
  `/game-days/[date]/vote` (PUT), `/game-days/[date]/open-slot` (POST/DELETE),
  `/game-days/[date]/admin` (GET/PATCH, squad-admin-only), `/api/squads/[squadId]/game-day-ops`
  (PATCH, squad-admin-only) and `/api/admin/game-day-tick` (POST, superadmin-only) - see "Game day
  check-in & attendance vote" below.
- `middleware.ts` matcher: `/s/:squad/admin/:path*`, `/s/:squad/user/:path*`, `/platform/:path*`
  (signed-in-at-all gate only - the real per-squad-admin/per-player boundary is the
  `resolveSquad*` calls above and each API route's `requireSquadAdmin`/`requireSuperAdmin`).

**Gotcha - squad-scoped links in shared components**: any component that builds a link/redirect
into `/s/[squad]/...` needs the squad's slug from `SquadContext`, and there are two ways to get
it depending on where the component can render:
- **`useSquad()`** (throws outside a provider) - safe for anything only ever rendered from inside
  a squad-scoped page tree (e.g. `EncounterCard`, `NavPlayerSearch` - the latter
  is only mounted from places already guarded by squad presence, see below).
- **`useOptionalSquad()`** (returns `null` outside a provider) - required for anything rendered
  *unconditionally* from the global nav (`Layout` → `NavigationComponent`), since that also
  renders on non-squad pages (`/`, `/login`, `/platform/squads`): `AccountMenu`, `ScoreboardNav`,
  `MobileScoreboardMenu`, `useLiveGames`/`usePlayers`, `LiveGamesControl`/`LiveGamesControlDesktop`.
  Each must either return early / render nothing when `squad` is `null`, or (as
  `MobileScoreboardMenu` does for its Encounters search tile) gate the squad-dependent section
  behind `{squad && (...)}` before mounting a child that itself assumes `useSquad()`.

The initial squad-tenancy PRs missed several of these (`LeaderboardRow`, `EncounterCard`,
`NavPlayerSearch`, the live-game nav links still pointed at old flat paths like
`/player/{id}/encounters` and 404'd) - fixed in
[#194](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/194), which also closed a related
crash risk (an unguarded `useSquad()` call reachable from a non-squad page). If you add a new nav
or leaderboard/encounter component with a squad-scoped link, use this pattern and don't repeat
that miss.

## Ranking / data-access layer

Untouched (already squad-agnostic pure functions, operate on whatever they're handed):
`eloCalculator.ts`, `absenteeManager.ts`, `activation.ts`, `playerUtil.ts`, `round.ts`,
`period.ts`, `playerStatus.ts`, and the characterization fixture/test.

`squadId`-threaded (every function that used to do an unscoped `findMany`/`findFirst` against
`Player`/`Encounter`/`Game` now takes/filters by it): `lib/ranking/players.ts`,
`lib/ranking/encounters.ts`, `lib/ranking/processEncounters.ts`, `lib/ranking/scorePersister.ts`,
and the open-slot/replacement additions - `lib/ranking/absenteeSpell.ts`,
`lib/ranking/boardVisibility.ts`, `lib/replacements.ts` (see "Open-slot & replacement players"
below). `lib/scheduling/playingDayCalculator.ts` is the one exception among the new files: it
takes a schedule object, not a `squadId`, and stays pure like the bucket above.
Functions that look up a single player/encounter by id also verify it belongs to the given
`squadId` before acting (ids are a shared, globally-unique sequence across all squads, so a
squad-scoped route can't be used to touch another squad's row by guessing an id).

## Squad settings: enabled / maxPlayers

- `enabled`: already existed from the original migration; pages already 404 a disabled squad
  (`resolveSquadOrNotFound`). Now actually toggleable via `/platform/squads`.
- `maxPlayers`: nullable roster-size cap. `addPlayer` (`lib/ranking/players.ts`) rejects a new
  player once a squad is at its cap.
- Both are **visible to a squad's own admins** (shown read-only on `/s/[squad]/admin/dashboard`
  and `/s/[squad]/admin/settings`, via `useSquadSettings()` / `GET /api/squads/[squadId]`) but
  **only editable by a platform superadmin** (`PATCH /api/squads/[squadId]`, `/platform/squads`).

## Squad visibility: `isPublic`

Public (default `true`) vs. private, on `Squad`. When public, that squad's active ranked players
(`playerRank > 0`) are included in the site-root leaderboard (`/`, `GET /api/rankings`). The same
email in multiple public squads appears once there with **summed** `rankScore`; last-5 and win
rate combine matches across those memberships. Private squads are excluded from the aggregate but
remain link-public at `/s/[slug]` like before. Unlike `enabled`/`maxPlayers`, editable by the
squad's **own admins** (`requireSquadAdmin`, not superadmin-only), via
`PATCH /api/squads/[squadId]/visibility` and a toggle on `/s/[squad]/admin/settings`.
Implementation: `lib/ranking/publicRankings.ts`.

## Squad schedule

One recurrence rule per squad (day of week, start/end time, effective start/end date, skip-dates
list for holidays), stored as a **single JSON blob** on `Squad.schedule` (`SquadScheduleData` in
`lib/squadSchedule.ts`) rather than separate columns - nothing ever queries/filters by any
individual field (day, a time, a date), so separate columns bought nothing but column count.
`null` = never configured; an object with `isRecurring: false` = explicitly one-off. **No longer
informational only**: the game-day check-in scheduler (below) reads it to create each session's
`GameDay`, and an admin cancelling a session adds its date to `skipDates`. It still does not drive
the old 17:00 Telegram poll. Carries a `timezone` (IANA, e.g. `Europe/Amsterdam`) qualifying
`startTime`/`endTime` - a start time without a zone is incomplete, and every clock in the check-in
feature is a wall-clock time in it. Optional on the stored type because rows written before it
have no such key; read it via `scheduleTimezone()`, which defaults to `Europe/Amsterdam`. No
migration was needed (`schedule` was already `Json?`). Validated by `validateScheduleInput` (unit
tested, including the zone); turning `isRecurring` off clears every other field inside the JSON,
so a squad can't be left with stale recurrence data contradicting its own flag. Editable by a squad's **own admins** (`requireSquadAdmin`, not superadmin-only like
enabled/maxPlayers - this is day-to-day squad management), via
`PATCH /api/squads/[squadId]/schedule` and the form on `/s/[squad]/admin/settings`.

`GET /api/squads/[squadId]` unpacks `schedule` back into the flat `isRecurring`/
`scheduleDayOfWeek`/`scheduleStartTime`/etc. field names on the wire - the collapse to one JSON
column is a storage-layer change only; `useSquadSettings()` and the settings page didn't need to
change. The original separate columns were packed into `schedule` in every environment before
they were dropped (rehearsed against the local dev DB with real seeded data). If those old
columns still exist on a database, `prisma/migrations/20250921120000_align_live_schema` packs
them into `schedule`.

## Open-slot & replacement players

Full design doc: `OPEN_SLOT_PLAYERS_PLAN.md` at the repo root. Summary of what's actually built:

- **`Player.playerType`**: `FULLTIME` (default, unchanged behavior) or `OPEN_SLOT` - fills a
  vacant spot rather than holding a permanent one, still gets ranked normally when they play. Set
  once at creation, never changed afterward - kept in the same `Player` table rather than split
  out (Elo needs one ranked pool; see the plan doc's "Why not separate tables").
- **`Player.rankScore` is nullable**: an open-slot player (admin-added now; self-registered in a
  later phase) may have no score yet. They stay selectable in the game-planner, but a scoreless
  player can never reach the Elo/absentee math - `POST/PUT` on
  `/api/squads/[squadId]/games{,/[id]}` reject any group containing one (400, names them), and
  `applyAbsenteeDeductions`/`calculateAndPersistElo` skip/throw on one respectively as a second
  line of defense. The friendly path is the game-planner's bulk-assign panel (blocks "Create Game
  Day" on any selected scoreless player, one action for the whole batch) backed by
  `assignInitialScores` / `POST /players/bulk-initial-score`.
- **`SlotReplacement`**: a fulltime player's slot filled by a named open-slot player over
  `[startDate, endDate]`. "Replacement" is a *derived* state (an active row covering today), never
  a stored `playerType` - avoids a stuck flag if a revert step is ever missed. Self-service, no
  admin approval: `/s/[squad]/user/replacement` (search by name/email via
  `GET /players/open-slot`, then `POST /replacements`) lets a fulltime player nominate an
  open-slot player for at least 3 *playing days* and at most `MAX_REPLACEMENT_MONTHS` (4) calendar
  months (validated against the squad's schedule via `lib/scheduling/playingDayCalculator.ts` -
  the squad must have one configured and recurring, or the request is rejected with a clear
  error). The upper bound is a hard requirement, not just a product rule: the calculator walks the
  range a day at a time, so an unbounded `endDate` (a date input will happily submit year 9999)
  is a multi-million-iteration block on a single-threaded server. A window that has already
  finished is rejected too (it could never be active); one that merely *started* in the past is
  allowed. Nominating stays fully self-service, but *ending a window early no longer applies
  immediately* - it needs admin approval. `PATCH /replacements/[id]` lets the nominating player
  request ending a window early - outright (empty body) or by pulling the end date in
  (`{ endDate }`, shorten-only, no re-extending) - which stamps `cancellationRequestedAt` (and
  `cancellationRequestedEndDate` for a shorten request) on the row rather than touching
  `cancelledAt`/`endDate`; a second request while one is already pending is rejected. Shortening
  is deliberately exempt from the 3-playing-day minimum, since outright cancellation is already
  allowed. A squad admin then decides it via `PATCH /replacements/[id]/cancellation` (body
  `{ decision: 'approve' | 'reject' }`, admin-only, 403 otherwise): approving applies whatever was
  requested (sets `cancelledAt`, or pulls `endDate` in) and clears the pending-request fields;
  rejecting just clears them, leaving the window on its original terms. `lib/replacements.ts`'s
  `requestCancelReplacementCancellation`/`requestReplacementShortening` record the request,
  `approveCancellationRequest`/`rejectCancellationRequest` decide it.
  `GET /replacements/preview?startDate=&endDate=` runs the same window
  validation for the nomination form so it can show "2 playing days selected, need 3" and the
  resolved dates before submit; it returns failures as data rather than throwing, and is a
  separate endpoint because `GET /api/squads/[squadId]` (which carries the schedule) is
  squad-admin-only.
  Overlap (same slot or same nominee already covered) is checked and inserted in one transaction,
  since MySQL can't express "no overlapping ranges" as a constraint. `GET /replacements` returns
  the caller's own nominations; `GET /replacements?scope=squad` returns every nomination in the
  squad and is squad-admin-only (403 otherwise), surfaced as a table on `/s/[squad]/admin/players`
  for support/dispute cases *and* as the approve/reject surface for pending cancellation requests
  (rows outside that state render no actions - creation is self-service and there's nothing to
  decide). The scope is an explicit parameter rather than being inferred from the caller's role:
  the player-facing page labels its list "Your replacements" and puts a Cancel button on each row,
  so role-inference would show a squad admin who is also a player every other member's nomination
  and invite them to cancel it.
- **Absentee sweep** (`applyAbsenteeDeductions` in `scorePersister.ts`) now has three paths:
  fulltime keeps the original row-based ladder (last-5-`ScoreHistory` escalation, auto-deactivate
  at 5) untouched; an open-slot player currently filling an active replacement ramps on a new
  **day-based** counter (`lib/ranking/absenteeSpell.ts`'s `absenteeSpellDays`, counting distinct
  processed squad game days since their last real play) with no cutoff and no deactivation; a
  plain open-slot player ramps on the same day-based counter but stops once it exceeds the
  squad's `Squad.openSlotAbsenteeGraceDays` (default 3, admin-editable) - a rolling exemption that
  resets the moment they play again, not a one-time onboarding grace. Neither new path can
  deactivate a player (that stays a manual admin action for open-slot players).
- **Leaderboard/graph visibility** (`lib/ranking/boardVisibility.ts`'s `filterBoardVisible`,
  layered on top of each surface's existing active-status filtering): fulltime and
  currently-active-replacement players are always shown; a plain open-slot player is shown only
  within `Squad.openSlotVisibilityGameDays` (default 10, admin-editable, deliberately longer than
  the absentee grace) game days of their last game. Applied to the squad rankings endpoint, the
  ranking-history trajectory graph/picker, and the cross-squad public rankings aggregate. They
  remain fully visible on the admin roster and their own profile/encounter-history pages
  regardless.
- **Game-planner picker** (`pages/s/[squad]/admin/game-planner.tsx`) splits into a "Full-time
  roster" group (`FULLTIME` plus any `OPEN_SLOT` player currently covering an active replacement)
  and a separate "Open slot" group - a stopgap grouping, not a real per-day availability system.
- **Admin roster** (`pages/s/[squad]/admin/players.tsx`) has a third list, "Not Yet Played"
  (`?status=enabled`), alongside Active and Inactive. `filterPlayersByStatusParam` maps `active`
  to `ACTIVE` and `inactive` to `DISABLED`, and `addPlayer` leaves `playerStatus` null, so
  without it a newly added player appeared on no admin screen at all - a brief gap for a fulltime
  player, but the permanent resting state for a scoreless open-slot one. The "needs a score"
  marker reads `PlayerInfo.hasScore` (taken straight off the row) rather than `rankScore === null`
  (which `toPlayerInfo` nulls for *every* non-`ACTIVE` player, so it can't tell "not currently
  ranked" from "never given a starting score"), and the status badge renders the server's derived
  three-state `status` instead of collapsing `ENABLED` and `DISABLED` into one "Inactive".
- **Two new squad settings**, both playing-day counts, deliberately independent (`Squad`,
  squad-admin-editable via `/api/squads/[squadId]/open-slot-settings` and a section on
  `/s/[squad]/admin/settings`): `openSlotAbsenteeGraceDays` (default 3, non-nullable - a
  null-means-never-exempt default would be the worst outcome, not the safest) and
  `openSlotVisibilityGameDays` (default 10).
- **Email exposure**: `GET /players/open-slot` is open to any signed-in squad member (the
  nomination picker needs it), so it returns a *masked* address (`a***@example.com`) rather than
  the real one - matching on the real address still happens server-side. Unmasked emails stay
  behind `requireSquadAdmin` via `getSecurePlayers`, as before.
- **Validation vs. server faults**: `lib/api/validationError.ts`'s `ValidationError` lets a route
  tell "the caller sent something invalid" apart from "something broke", so
  `bulk-initial-score` and the game create/update routes answer 400 with the reason instead of a
  blanket 500. `findScorelessPlayersInGroups` throws it for an id that isn't in this squad -
  a missing row must not read as "not scoreless" and slip through the gate.
- **Not built yet** (see "Explicitly out of scope so far"): the public "browse squads / request to
  join as open-slot" self-service flow, and migrating the fulltime pool's deactivation logic onto
  the day-based playing-day calculator instead of its current row-based counter.

## Game day check-in & attendance vote

Full design doc: `ATTENDANCE_VOTE_PLAN.md` at the repo root (PR #210), including an
"Implementation notes" section listing where the build refined it. Summary of what's built:

- **Models.** `GameDay` - one squad's session on one playing date (`@@unique([squadId,
  gameDate])`), created `voteOpensDaysBefore` days ahead by the scheduler. It **snapshots**
  `startTime`/`endTime`/`timezone`/`minPlayers` at creation and stores the resolved
  `votesCloseAt` (13:00 on the day) and `slotLockAt` (start - 2h) instants - a game day is a
  published promise, so editing the schedule later never moves an announced deadline.
  `GameDayVote` - one slot holder's in/out answer. `GameDayOpenSlot` - an open-slot player's place
  on the waiting list (`WAITING`) or assigned slot (`ASSIGNED`, `source` `WAITING_LIST` or
  `DIRECT`), or a slot they gave back (`WITHDRAWN`, terminal for that game day).
  `Game.gameDayId` (nullable, unique) links a planned game back to its vote.
- **Status is `VOTING_OPEN` / `VOTING_CLOSED` / `CANCELLED`, not `OPEN`/`CLOSED`**: the 13:00
  deadline closes the *vote*, not the session, which starts hours later. The session's own
  upcoming/live/ended phase is derived from the clock (`lib/gameDay/voteWindow.ts`), never stored.
- **Eligibility** (`lib/gameDay/eligibility.ts`), resolved against the **game date, not today** -
  a vote opens days ahead, so a replacement window starting tomorrow already moves the slot:
  structural holders = `FULLTIME` minus replacement owners, plus `OPEN_SLOT` replacement
  fillers; open-slot pool = the other `OPEN_SLOT` players; voters = structural holders plus
  anyone `ASSIGNED` an open slot that day; all excluding `DISABLED`. The first two are disjoint.
- **`slotsHeld` vs `confirmedIn`** (`lib/gameDay/counts.ts`), which must stay separate:
  `slotsHeld` (structural INs + `ASSIGNED` open slots) governs how many more people may be let
  in; `confirmedIn` (INs the voter cast themselves) is attendance - the 09:00 check, the roster,
  the planner's pre-tick. Two ways to hold a slot without confirming: an assignee who has not
  voted, and an **inherited reservation** - after the deadline a transferred IN moves to the
  incoming holder (`GameDayVote.inheritedFromPlayerId`) so the sync cannot promote a waiting-list
  player into it and fill one physical slot twice. A transfer after the deadline of an OUT/absent
  vote reserves nothing, but leaves a choice-less inherited row so the new holder may still
  confirm until `slotLockAt`.
- **Vote rules** (`lib/gameDay/votes.ts`'s `evaluateVote`, one pure table used by the write path
  and by the page to decide which buttons to offer): free switching while open; after the
  deadline a holder cannot vote IN (unless they gained the slot after it) and can vote OUT only
  from an IN; a `WAITING_LIST` assignee can give the slot back until `slotLockAt`; a `DIRECT`
  claimer never can (an admin can release it).
- **The vacancy sync** (`lib/gameDay/openSlots.ts`): `planVacancySync(tx, id)` runs inside the
  caller's locked transaction and always promotes waiting-list players, strictly by `joinedAt`,
  up to the gap; `deliverVacancyPlan` posts to the open-slot group *after* commit and only then
  advances `announcedVacancies`/`vacancyAnnouncedAt`, so a failed send is retried (names
  included) by the scheduler's next pass. No-op past `slotLockAt` or without a minimum. Every
  write takes `SELECT ... FOR UPDATE` on the `GameDay` row first (`withGameDayLock`, READ
  COMMITTED), and nothing inside opens a second transaction.
- **Eligibility is live** (`lib/gameDay/reconcile.ts`): `createSlotReplacement` and
  `approveCancellationRequest` (outright cancel *and* shorten) call `reconcileSlotTransfer` in
  their own transaction for every existing, not-yet-ended `VOTING_OPEN`/`VOTING_CLOSED` game day
  in range - today's included; it never creates a row. The incoming holder's open-slot row is
  *deleted*, never `WITHDRAWN`. A player auto-deactivated by the absentee sweep is cleared from
  live game days afterwards (`removeDisabledPlayerFromGameDays`, best-effort, outside the ranking
  transaction).
- **Scheduler** (`lib/gameDay/scheduler.ts`, every 5 minutes from `instrumentation.ts`, beside the
  untouched 17:00 poll). Pass A, per squad with a recurring schedule and check-in on: scan every
  squad-local date from today to today + `voteOpensDaysBefore` (recovers a missed day), create
  missing rows with a no-op conflict path, cancel open rows no longer on the schedule, and
  re-create a cancelled one in place (fresh vote) once its date is back. Pass B, over every live
  row: announce, 09:00 open-slot ping (only when `confirmedIn` is short), 10:00 reminder - each
  stamped once, bounded above by the deadline so an outage never sends them late - then close
  voting and sync; and retry the sync on closed rows until `slotLockAt`. One squad's (and one
  row's) failure never stops another's. A superadmin can run a tick now from the admin dashboard.
- **`Squad.gameDayOps`** (`lib/gameDayOps.ts`, one JSON blob like `schedule`): `enabled`,
  `voteOpensDaysBefore` (1-14, default 2), `minPlayersForOpenSlot` (4-20 or null = no open-slot
  flow), `telegramMainChatId`, `telegramOpenSlotChatId`. **Default off** (null = nothing created,
  nothing sent) - deliberately the opposite of `openSlotAbsenteeGraceDays`, because this one posts
  to Telegram groups. Squad-admin-editable via `PATCH /game-day-ops` and a card on the settings
  page; turning it off cancels every open vote in the same request, and so does disabling the
  squad from platform admin (`PATCH /api/squads/[squadId]`, a different handler) - both via
  `cancelOpenGameDays`. The bot token stays the one shared `TELEGRAM_BOT_TOKEN`; only chat ids are
  per-squad. `GET /api/squads/[squadId]` unpacks it into flat `gameDayXxx` fields.
- **Routes**: `GET /game-days` (upcoming = not ended and not cancelled - *not* "voting open",
  which would drop today's row at 13:00), `GET /game-days/[date]` (the caller's view: role, vote,
  allowed actions, and the roster - withheld from a voter who has not voted yet), `PUT
  /game-days/[date]/vote`, `POST|DELETE /game-days/[date]/open-slot`, `GET|PATCH
  /game-days/[date]/admin` (`close` / `cancel` / `release`). `[date]` is `YYYY-MM-DD` or 400;
  no row is 404. **Identity rule**: the acting player always comes from the session, never a
  body - except the admin `release`, where an admin acting on another player is the point.
- **Game Planner** pre-ticks today's `confirmedIn` players once voting has closed and shows a
  banner of post-deadline dropouts and everyone holding a slot unconfirmed (with a release
  action); it only seeds the selection - distribution, rank-order slicing and the scoreless gate
  are unchanged. `POST /games` stamps `gameDayId` (400 naming the existing game on a second
  create). `Game.createdAt` stays the encounter date for submit/process.

## Production migration (history)

Squad tenancy needed a real data migration (existing single-squad data → one `Squad`), done in
stages because `prisma db push` can't add a `NOT NULL` column and backfill it in the same shot
against a populated table, and the `Player.email` audit is a data-quality checkpoint. Later
squad-level features (`maxPlayers`, schedule fields) were plain additive nullable columns and
didn't need staging - just `prisma db push`.

**Ongoing schema changes** use checked-in Prisma migrations under `frontend/prisma/migrations/`
and `node scripts/prisma-migrate-deploy.mjs` (see **Prisma schema & migrations** in `CLAUDE.md`).
The 2026-09-20 cutover used one-off staged SQL (`prisma/squad-migration/` +
`scripts/migrate-to-squads.mjs`); those files were removed once Prisma history covered the same
schema.

- **Cutover (historical):** expand (`Squad`/`SquadAdmin`, nullable `squad_id`), backfill one
  squad onto existing rows, placeholder email for any player with none, then contract (`NOT
  NULL`, unique indexes, FKs).
- **Rehearsed** end-to-end (twice) against a scratch copy of real production data (loaded from a
  `mysqldump` backup into a throwaway database on the local dev MySQL container) before ever
  touching production, including confirming `stage1` is safely idempotent on a second run and a
  final `prisma migrate diff` shows zero drift from `schema.prisma`.
- **Run against production** on 2026-09-20: squad name "Dutch Lankan Shuttle Masters", slug
  `wednesday` (all 22 existing players belong here; a separate `friday` squad - a real second
  roster, not just a Telegram notification group - is planned but not created yet). One real
  player (id 19, "Pasan") had no email and got the placeholder
  `player19@placeholder.invalid` - **still needs a real email** before they can log in.
  `ALLOWED_ADMIN_EMAILS` was empty in the shell session `stage1` ran in, so no `SquadAdmin` rows
  were seeded for `wednesday`; the platform-superadmin env var already configured on the real
  container covers admin access in the meantime.
- Deployed via the existing `workflow_dispatch` GitHub Actions workflow
  (`.github/workflows/[dutchlankanshuttlemasters]publish-frontend-image-ghcr-v3.yaml`), which
  always builds a fixed `:v3.0` tag (a deliberate choice for this rollout - "we can revert and
  push again" rather than keeping a distinct rollback tag).

## Explicitly out of scope so far

- Making the old Telegram "who's in" poll (`lib/telegram/`, the 17:00 cron in
  `instrumentation.ts`) per-squad configurable, or having the schedule drive it - it's still a
  single global cron job, now running beside the game-day check-in rather than replaced by it.
- Retiring that old poll once the check-in has proven itself (ATTENDANCE_VOTE_PLAN.md, Decision 2).
- Per-squad Telegram bot tokens, more than one playing day per week, per-player notifications,
  and auto-creating the `Game` row when voting closes (the planner pre-ticks instead).
- Getting Pasan's real email.
- Folding the separate `apl-aragorn-duckdns` deployment into this squad model.
- The public "browse squads / request to join as open-slot" self-service flow (open-slot players
  are admin-added only for now; see "Open-slot & replacement players" above).
- Migrating the fulltime pool's deactivation logic off its row-based counter onto the same
  day-based `playingDayCalculator`/`absenteeSpellDays` primitive the open-slot paths use.

## PRs

1. [#189](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/189) - core tenancy: schema,
   auth, ranking data-access layer, routing.
2. [#190](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/190) - squad `enabled` /
   `maxPlayers`, superadmin-only edit.
3. [#191](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/191) - squad recurrence
   schedule, squad-admin-editable.
4. [#192](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/192) - squad-picker
   auto-redirect for exactly-one-squad users.
5. [#193](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/193) - this doc, and stale-path
   fixes in `CLAUDE.md`.
6. [#194](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/194) - fixed several
   `/s/[squad]/...` links that #189 missed (see the routing gotcha above).
7. [#195](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/195) - squad `isPublic`
   (public/private), squad-admin-editable.
8. [#196](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/196) - collapsed the
   recurrence-schedule columns into `Squad.schedule` (one JSON column).
9. [#198](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/198) - design doc for
   open-slot/replacement players (`OPEN_SLOT_PLAYERS_PLAN.md`).
10. [#203](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/203) - open-slot/replacement
    players implementation (see "Open-slot & replacement players" above).
11. [#210](https://github.com/ShuttleTrack/ShuttleTrackRanking/pull/210) - design doc for the
    game-day check-in & attendance vote (`ATTENDANCE_VOTE_PLAN.md`); implemented in the PR that
    follows it (see "Game day check-in & attendance vote" above).
