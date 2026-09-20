# Multi-Squad Tenancy Plan

## Goal

ShuttleTrackRanking currently supports exactly one friend group: `Player`, `Encounter`, `ScoreHistory`, and `Game` are global tables, and "admin" is a single flat `ALLOWED_ADMIN_EMAILS` env var. This plan introduces **squads** — independent tenants that each get their own roster, game days, and ranking board in the same deployment — without changing the ranking math or the auth mechanism.

**Not changed:**
- The Elo/absentee/activation ranking logic in `lib/ranking/` — untouched, byte-for-byte.
- Google SSO — sign-in stays exactly as it is today.
- The existing DaisyUI/Tailwind look and feel — new UI is built from the same components/patterns already in the codebase, not a redesign.

**Added:**
- A `Squad` entity that owns players/encounters/games.
- Join-table-based admin and player membership per squad, replacing the flat global admin list.

## Data model changes

Two new tables, three new foreign keys. No existing column is removed.

```prisma
model Squad {
  id        Int      @id @default(autoincrement())
  name      String
  slug      String   @unique
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  admins     SquadAdmin[]
  players    Player[]
  encounters Encounter[]
  games      Game[]
}

model SquadAdmin {
  id      Int    @id @default(autoincrement())
  squadId Int
  email   String
  squad   Squad  @relation(fields: [squadId], references: [id])

  @@unique([squadId, email])
}
```

- **`Player`** gains `squadId` + relation, and `email` becomes **required** (not nullable) going forward — email is now the only link between a login and a role in a squad, so every player needs one. The same Google email can now have one `Player` row per squad, each with its own `rankScore`/`playerRank`/etc. — the same person can be an independently-ranked player in multiple squads.
- **`Encounter`** gains `squadId` + relation; the uniqueness constraint becomes `[squadId, team1, team2, encounterDate]`. This needs a direct column (not a derived join) because `team1`/`team2` are opaque encoded player-id strings — query filters like "all unprocessed encounters for date X" need `squadId` directly in the `where` clause.
- **`Game`** gains `squadId` + relation, same reasoning — `groups`/`scores` are JSON blobs of player ids, not FK-joinable.
- **`ScoreHistory`** is left unchanged. It's always queried by `playerId`, and `playerId` already uniquely pins a squad once `Player` is squad-scoped, so no denormalized `squadId` is needed there.

## Data migration

One-time backfill for the existing single-squad data:
1. Push the new tables/columns.
2. Create one `Squad` row for the existing data.
3. Backfill `squadId` on every existing `Player`, `Encounter`, `Game` row to that squad's id.
4. Audit existing players for a missing or duplicate email within that squad (today there's no email uniqueness or required-ness at all) and resolve any collisions. Any player with no email is grandfathered into the roster/history as-is but can't log in until an email is added.
5. Make `squadId` required, make `Player.email` required, and add the `@@unique([squadId, email])` constraint.
6. Convert today's `ALLOWED_ADMIN_EMAILS` list into `SquadAdmin` rows for that default squad. The env var itself stays in place — see below.

## Auth & access model

Google SSO itself is untouched. What changes is what "admin" means, since it's no longer a single global flag:

- `ALLOWED_ADMIN_EMAILS` becomes the **platform-superadmin** list: it can create new squads, assign/remove admins on any squad, and is implicitly an admin of every squad.
- A new `SquadAdmin` join table (squad + email) grants admin rights scoped to one squad — the day-to-day equivalent of what today's global admin flag does, just per-tenant.
- Access checks resolve **per request, per squad** rather than being cached as one flag on the session: given a signed-in email and a squad id, look up whether that email is a `SquadAdmin` for that squad, and separately whether it has a `Player` row in that squad. This lets the same person be an admin in one squad and just a player (or nobody) in another, with no stale cross-squad state.
- The session itself shrinks to identity + platform-superadmin status; squad-specific admin/player status is resolved fresh wherever it's needed.
- **Login is required for everything except the public ranking page.** Viewing a squad's leaderboard needs no sign-in; encounter history, game viewer, player ranking history, all user pages, and all admin pages require a signed-in, recognized account. Today only `/admin/*` is gated — this widens that gate to nearly the whole app.

## Ranking/data-access layer

The pure math modules (Elo calculation, absentee demerits, activation, team-id encoding, rounding, period labeling) are not touched at all — they're already squad-agnostic functions that operate on whatever player/encounter data they're handed.

What changes is the **data-access layer around them**: every function that currently does an unscoped `findMany`/`findFirst` against `Player`/`Encounter`/`Game` gets a `squadId` added to its query and, where relevant, its signature. This includes the day's-encounters lookup used for score-gap calculation, the full-roster lookup used for re-ranking, the absentee-deduction pass, and encounter processing for a given date — today these are global queries, which is a real correctness gap for multi-tenancy (two squads playing on the same calendar date would otherwise corrupt each other's processing run). Threading `squadId` through this layer fixes that as a side effect of adding tenancy.

## Routing

Every board needs to stay bookmarkable and shareable, so squads are identified in the URL rather than through a session-only "active squad" selector:

- The **only public, no-login page** is a squad's ranking/leaderboard, e.g. `/s/{squad-slug}`.
- Everything else sits behind sign-in: encounter history, game viewer, and player ranking history move under `/s/{squad-slug}/...` alongside the existing player-facing pages under `/s/{squad-slug}/user/...`, all requiring a signed-in account.
- Admin pages move under `/s/{squad-slug}/admin/...`, gated by the per-squad admin check described above.
- API routes move under `/api/squads/{squadId}/...`, with every handler validating the squad id and scoping its queries accordingly; every route except the public ranking read requires a session.
- `middleware.ts`'s matcher, which today only protects `/admin/:path*`, widens to cover everything squad-scoped except the ranking root.
- Sign-in stays global. After signing in, a squad-picker landing page lists the squads the signed-in email administers or plays in.
- A new platform-level, superadmin-only surface handles creating squads and assigning/removing squad admins.

Page markup itself is not rewritten — existing components are relocated and given a `squadId` prop, not redesigned.

## Cleanup alongside this work

The vestigial `pages/api/local/**` routes (already dead, unused scaffolding per this repo's own docs) are removed rather than migrated, so dead code doesn't get dragged through a tenancy rewrite.

## Explicitly out of scope for this pass

- Making the Telegram "who's in" daily poll per-squad-configurable — it stays a single global scheduled job for now; a separate follow-up.

## Verification

- Existing ranking-math characterization test must keep passing bit-for-bit, proving the math itself is untouched.
- New tests assert squad isolation: a player or encounter created in one squad never appears in another squad's queries.
- Manual smoke test: create two squads, add distinct players to each, run a full game day in one, and confirm the other squad's roster/rankings/game state are completely unaffected.
