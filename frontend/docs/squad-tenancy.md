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
  `enabled`, `maxPlayers` (nullable = unlimited), `isPublic` (default `true`, no behavioral
  difference yet), plus `schedule` (a single JSON blob for the recurrence schedule - see below).
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
- **Recurrence schedule** (on `Squad`, informational only - see "Squad schedule" below):
  `isRecurring`, `scheduleDayOfWeek` (`DayOfWeek` enum), `scheduleStartTime`/`scheduleEndTime`
  (`"HH:mm"` strings), `scheduleStartDate`/`scheduleEndDate` (recurrence validity window, end
  nullable = ongoing), `scheduleSkipDates` (JSON array of `"YYYY-MM-DD"` strings, holidays etc.).

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
- Page-level gates (`lib/squadPage.ts`, used in `getServerSideProps`):
  `resolveSquadOrNotFound` (public pages - 404s a missing/disabled squad, and if signed in also
  resolves `isSquadAdmin`/`isPlayerHere` purely so nav links can reflect it),
  `resolveSquadAdminOrRedirect` (admin pages - redirects to `/login` or the squad root),
  `resolveSquadUserOrRedirect` (user pages - also returns the caller's `playerId` in *this*
  squad, since a static session-wide `playerId` no longer makes sense once one person can have a
  different `Player` row per squad).
- `SquadContext` (`contexts/SquadContext.tsx`) - React context carrying `{ id, slug, name,
  isSquadAdmin, isPlayerHere }`. `_app.tsx` sets it up from the page's `squad` prop (pulled out of
  `pageProps` before `<Layout>`, so the global nav - which renders outside any single page's own
  render tree - can see it too). `useSquad()` throws outside a provider (every squad-scoped page
  must supply one); `useOptionalSquad()` doesn't, for nav components shared with non-squad pages
  (squad picker, login, platform admin).

## Routing

- **Public** (no login): `/s/[squad]/{index,encounter-history,game-viewer,player-ranking-history,player/[id]/encounters}`.
- **User** (signed-in + registered player in that squad): `/s/[squad]/user/{profile,matches,management}`.
- **Admin** (signed-in + squad admin, or superadmin): `/s/[squad]/admin/{dashboard,game-day,game-planner,players,score-keeper,settings}`.
- **Platform** (superadmin only): `/platform/squads` - create squads, manage each squad's admins,
  edit `enabled`/`maxPlayers`.
- **`/`** - squad picker. Resolves the signed-in email's squads server-side and redirects straight
  to `/s/{slug}` when there's exactly one (including for a superadmin, if there's only one squad
  in the whole system) - no picker click for the common case. Shows the picker for 0 or 2+ squads,
  a sign-in prompt when signed out.
- **`/login`** - stays global, not squad-scoped.
- **API**: everything under the old flat `/api/{players,games,encounters,rankings,user}/**` moved
  to `/api/squads/[squadId]/**`. Plus `/api/squads` (list mine / create, superadmin-only create),
  `/api/squads/[squadId]` (GET detail incl. schedule fields, squad-admin-readable; PATCH
  `enabled`/`maxPlayers`, superadmin-only), `/api/squads/[squadId]/admins` (superadmin-only),
  `/api/squads/[squadId]/schedule` (PATCH, squad-admin-editable).
- `middleware.ts` matcher: `/s/:squad/admin/:path*`, `/s/:squad/user/:path*`, `/platform/:path*`
  (signed-in-at-all gate only - the real per-squad-admin/per-player boundary is the
  `resolveSquad*` calls above and each API route's `requireSquadAdmin`/`requireSuperAdmin`).

**Gotcha - squad-scoped links in shared components**: any component that builds a link/redirect
into `/s/[squad]/...` needs the squad's slug from `SquadContext`, and there are two ways to get
it depending on where the component can render:
- **`useSquad()`** (throws outside a provider) - safe for anything only ever rendered from inside
  a squad-scoped page tree (e.g. `LeaderboardRow`, `EncounterCard`, `NavPlayerSearch` - the latter
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
`lib/ranking/encounters.ts`, `lib/ranking/processEncounters.ts`, `lib/ranking/scorePersister.ts`.
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

Public (default `true`) vs. private, on `Squad`. **No behavioral difference yet** - reserved for
a future public directory/dashboard that pulls together all public squads' info; nothing reads
this field today. Unlike `enabled`/`maxPlayers`, editable by the squad's **own admins**
(`requireSquadAdmin`, not superadmin-only - same reasoning as the schedule fields: this is the
squad's own call, not platform governance), via `PATCH /api/squads/[squadId]/visibility` and a
toggle on `/s/[squad]/admin/settings`.

## Squad schedule

One recurrence rule per squad (day of week, start/end time, effective start/end date, skip-dates
list for holidays), stored as a **single JSON blob** on `Squad.schedule` (`SquadScheduleData` in
`lib/squadSchedule.ts`) rather than separate columns - nothing ever queries/filters by any
individual field (day, a time, a date), so separate columns bought nothing but column count.
`null` = never configured; an object with `isRecurring: false` = explicitly one-off. **Still
informational only**: nothing reads it to auto-create a game day or drive the Telegram poll.
Validated by `validateScheduleInput` (unit tested); turning `isRecurring` off clears every other
field inside the JSON, so a squad can't be left with stale recurrence data contradicting its own
flag. Editable by a squad's **own admins** (`requireSquadAdmin`, not superadmin-only like
enabled/maxPlayers - this is day-to-day squad management), via
`PATCH /api/squads/[squadId]/schedule` and the form on `/s/[squad]/admin/settings`.

`GET /api/squads/[squadId]` unpacks `schedule` back into the flat `isRecurring`/
`scheduleDayOfWeek`/`scheduleStartTime`/etc. field names on the wire - the collapse to one JSON
column is a storage-layer change only; `useSquadSettings()` and the settings page didn't need to
change. The original separate columns were packed into `schedule` in every environment before
they were dropped (rehearsed against the local dev DB with real seeded data). If those old
columns still exist on a database, `prisma/migrations/20250921120000_align_live_schema` packs
them into `schedule`.

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

- Making the Telegram "who's in" scheduler (`lib/telegram/`, `instrumentation.ts`) per-squad
  configurable - it's still a single global cron job.
- Anything reading the recurrence schedule to *do* something (auto-create a `DRAFT` game day,
  drive the Telegram poll) - schedule storage/editing is built, automation isn't.
- Getting Pasan's real email.
- Folding the separate `apl-aragorn-duckdns` deployment into this squad model.

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
