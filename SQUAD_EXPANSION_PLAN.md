# Plan: Multi-Squad Rankings (Wednesday + Friday, extensible to more)

Status: **DRAFT — for review, no implementation started.**
Owner: BRS maintainers
This file is a review/handoff artifact from a planning conversation (Claude Code) — it exists so a human reviewer can verify the approach before any code is written. It is not itself a task list for an agent to execute; treat "Phased implementation plan" (§7) as the starting point for that once this is approved.

---

## 1. Goal

Today BRS maintains exactly one ranking pool, implicitly "Wednesday's group," even though the site never says so explicitly. We already send Telegram "who's in" reminders for two days (Monday poll → Wednesday match, Wednesday poll → Friday match), but the website, the `Player` ranking fields, and all ranking math only ever operated on one undifferentiated player pool.

We want the site to serve **multiple independent day-based cohorts** — called **squads** in this plan — starting with `WEDNESDAY` and `FRIDAY`, with:
- A person able to belong to one or both squads.
- Each squad's rank score, rank position, highest-rank, activation status, and encounter/score history tracked **fully independently** — playing (or not playing, or being deactivated) in one squad must have zero effect on the other.
- The list of squads itself hardcoded (a config list, not admin-managed in the DB) — acceptable per explicit product direction, and cheap to extend when a third squad shows up.

## 2. Why / context (don't re-litigate)

- The codebase already overloads the word **"group"** for something unrelated: the skill-tier pools within a single game day (`Encounter.groupIndex`/`totalGroups`, `Game.groups`, `game-planner.tsx`'s `calculateGroupDistribution`). This plan introduces **"squad"** as a new, distinct term specifically to avoid colliding with that existing meaning. Do not call the new concept a "group" anywhere in code, schema, or UI copy.
- Confirmed with the product owner (this conversation):
  - Only **one game is ever in progress at a time** — games finish the same day they start, so Wednesday's and Friday's `Game` rows never overlap in time. This means we do **not** need to support concurrent in-progress games across squads; we only need the existing single `Game` row to know *which* squad it belongs to.
  - **Admins are the same people for both squads** — no per-squad admin permissioning needed. The existing global `ALLOWED_ADMIN_EMAILS` + `Player` lookup admin model is unaffected.
  - Player eligibility/activation status (ACTIVE/DISABLED) and the "last 5 games" absentee/deactivation window are **per squad**, not global — a player can be active on Wednesday and disabled on Friday independently.
  - Squad membership is **admin-managed** (a toggle per player per squad on the admin players page), not self-serve from Telegram poll responses.
  - The public site exposes squads via **path-scoped routes** (e.g. `/wednesday/...`, `/friday/...`), not a single view with a client-side day switcher.
- This is a small, low-traffic friends-group app with no existing migration tooling (schema changes are applied via `prisma db push`, no Flyway/Liquibase, no migration history — see `MIGRATION_PLAN.md` §2). A brief maintenance-window migration (not a zero-downtime dual-write rollout) is assumed acceptable — **flagged as an assumption for reviewers to confirm**, not a unilateral decision.

## 3. Terminology

| Term | Meaning |
|---|---|
| **Squad** | The new concept: a day-based cohort (`WEDNESDAY`, `FRIDAY`, ...). Hardcoded list, not DB-managed. |
| **Group** (existing, unchanged) | The skill-tier pool within one game day (existing `Encounter.groupIndex`/`Game.groups` meaning). Do not conflate with squad. |
| `SquadId` | New TS type, a string literal union (`'WEDNESDAY' | 'FRIDAY'`), deliberately **not** reusing `telegram/nextOccurrence.ts`'s `DayName` — a squad identity and its weekday schedule are conceptually separate (a future squad could share a weekday with another, e.g. two Wednesday cohorts), even though today they're 1:1. |

## 4. Data model changes

### 4.1 New: squad config module (not a DB table)

New file, e.g. `frontend/src/lib/ranking/squads.ts`, mirroring the existing pattern in `telegram/scheduleConfig.ts`:

```ts
export type SquadId = 'WEDNESDAY' | 'FRIDAY';

export interface SquadConfig {
  id: SquadId;
  displayName: string;
  matchDay: DayName; // reuses telegram's DayName for the actual weekday
}

export const SQUADS: SquadConfig[] = [
  { id: 'WEDNESDAY', displayName: 'Wednesday', matchDay: 'WEDNESDAY' },
  { id: 'FRIDAY', displayName: 'Friday', matchDay: 'FRIDAY' },
];
```

Adding a third squad later = one entry here + a backfill step, not a schema change.

### 4.2 `Player` — shrinks to pure identity

Remove (moved to §4.3): `rankScore`, `playerRank`, `highestRank`, `rankSince`, `playerStatus`.
Keeps: `id`, `name`, `email`, `colorHex`, the legacy dead `disabled` column (untouched, per existing comment).

### 4.3 New model: `PlayerSquadStanding`

```prisma
model PlayerSquadStanding {
  id           Int       @id @default(autoincrement())
  playerId     Int       @map("player_id")
  squad        String    @db.VarChar(16) // SquadId
  rankScore    Float     @default(1000) @map("rank_score")
  playerRank   Int?      @map("player_rank")
  highestRank  Int?      @map("highest_rank")
  rankSince    DateTime? @map("rank_since") @db.Date
  playerStatus String?   @map("player_status")

  player Player @relation(fields: [playerId], references: [id])

  @@unique([playerId, squad])
  @@map("PLAYER_SQUAD_STANDING")
}
```

This is exactly the field set removed from `Player` in §4.2, just keyed by `(playerId, squad)` instead of by `playerId` alone. A player with no row for a squad is simply not a member of it (no membership = no standing = doesn't show up in that squad's roster/rankings).

### 4.4 `Encounter` — add `squad`

```prisma
squad String @db.VarChar(16) // SquadId
```
`@@unique([team1, team2, encounterDate])` → `@@unique([team1, team2, encounterDate, squad])`.

### 4.5 `ScoreHistory` — add `squad`

```prisma
squad String @db.VarChar(16) // SquadId
```
Needed because the absentee "last 5 games" window (`absenteeManager.countAbsentTimes`) and rank/score history views must be computed per squad, not globally.

### 4.6 `Game` — add `squad`

```prisma
squad String @db.VarChar(16) // SquadId
```
Since only one `Game` is ever in progress at a time (§2), this is purely a tag saying which squad's roster/standings this game-day session reads from and will write back to on Process — no concurrency handling needed.

### 4.7 Migration approach for §4.2/§4.3 (the risky part)

This moves live columns off `Player`, so it's a genuine data migration, not just an additive change. Two-step, matching the caution `MIGRATION_PLAN.md` used for its own schema work:

1. **Additive step**: add `PlayerSquadStanding` (and the `squad` columns in §4.4–4.6) via `prisma db push`, leaving `Player`'s old columns in place untouched.
2. **Backfill**: for every existing `Player` row, insert one `PlayerSquadStanding` row with `squad = 'WEDNESDAY'`, copying `rankScore`/`playerRank`/`highestRank`/`rankSince`/`playerStatus` verbatim. Backfill `Encounter.squad` and `ScoreHistory.squad` = `'WEDNESDAY'` for all existing rows (safe — only one day's data exists today). Any existing `Game` row gets `squad = 'WEDNESDAY'` (it's transient/non-authoritative per `CLAUDE.md` — fine to default it).
3. **Verify**: re-run `characterization.test.ts` and a manual comparison (old `Player` fields vs. new `PlayerSquadStanding` row per player) against a local copy of prod data — same pattern `MIGRATION_PLAN.md` Phase 1 used (`brs-local-mysql` container) — confirming Wednesday's standing is byte-for-byte unchanged.
4. **Cutover**: switch all read/write code (§5) to `PlayerSquadStanding` exclusively.
5. **Drop step** (separate, later, low urgency): once §5/§6/§7 are verified in production reading/writing only `PlayerSquadStanding`, drop `rankScore`/`playerRank`/`highestRank`/`rankSince`/`playerStatus` from `Player`.

**Rejected alternative**: keep `Player`'s existing columns as an implicit "Wednesday" standing and only add `PlayerSquadStanding` for additional squads. Avoids touching legacy data, but permanently special-cases Wednesday (two different code paths depending on which squad you're reading), which undermines the "N squads" goal this plan is for. Not recommended.

## 5. Ranking-math layer changes (`frontend/src/lib/ranking/`)

Every function that currently reads/writes `Player`'s ranking fields or scans "all players" needs a `squad: SquadId` parameter and to operate on `PlayerSquadStanding` scoped to it:

| File | Change |
|---|---|
| `players.ts` | `getPlayers`, `getSecurePlayers`, `getAllPlayersHistory`, `getAvailablePlayersForGame`, `addPlayer`, `updatePlayer`, `toPlayerInfo`/`toSecurePlayerInfo`/`toRawPlayerJson` — all take `squad`, join/filter on `PlayerSquadStanding` instead of reading fields off `Player` directly. `addPlayer` becomes "add a standing for an existing or new player in this squad" — needs a UX decision (see §8). |
| `playerStatus.ts` | `derivePlayerStatus`/`isActive`/`filterPlayersByStatusParam` operate on a `PlayerSquadStanding` row instead of a `Player` row. |
| `playerUtil.ts` | `getRankedPlayers` sorts by the squad-scoped `rankScore`/`playerRank`. |
| `period.ts` | `timeInHighestRankLabel(rankSince)` — no logic change, just now fed a squad-scoped `rankSince`. |
| `absenteeManager.ts` | Pure decision functions (`countAbsentTimes`, `decideAbsenteeAction`) are unchanged logically — but every caller must scope the "last 5 `ScoreHistory` rows" query to `(playerId, squad)`. |
| `activation.ts` | Pure functions unchanged — callers (`scorePersister.ts`) must scope "current min active score" / "who holds this rank" to the squad's `PlayerSquadStanding` pool. |
| `scorePersister.ts` | Writes go to `PlayerSquadStanding` (upsert on `(playerId, squad)`) instead of `Player`; `ScoreHistory` rows get `squad` set. |
| `encounters.ts` | Encounter create/read take/filter on `squad`. |
| `processEncounters.ts` (`processEncountersForDate`) | Takes `squad`; the absentee sweep ("everyone who didn't play") and re-rank scan `PlayerSquadStanding` for that squad only — this is the change that actually delivers "scores tracked independently." |
| `eloCalculator.ts`, `round.ts` | Expected **no change** — pure math over scores passed in by the caller, already squad-agnostic. Confirm during implementation that nothing here reaches back into `Player`/DB state directly. |

`characterization.test.ts` stays pointed at the frozen Wednesday-only fixture (still a valid oracle for the math itself); add new tests asserting squad isolation (see §9).

## 6. API routes (`frontend/src/pages/api/**`)

| Route | Change |
|---|---|
| `players/index.ts`, `players/[id].ts`, `players/[id]/activate.ts`, `players/[id]/encounters.ts`, `players/inactive.ts` | Add `squad` (query param for GET, body field for POST/PUT). |
| `rankings/index.ts`, `rankings/history.ts` | Add `squad` query param. |
| `game/players.ts` | Add `squad` query param (which squad's roster to plan a game day from). |
| `games/index.ts` | `squad` on `Game` creation. |
| `games/in-progress.ts`, `games/my-matches.ts` | Filter/scope by `squad`. |
| `games/[id].ts`, `[id]/start.ts`, `[id]/submit.ts`, `[id]/process.ts`, `[id]/live.ts` | Mostly read `squad` off the already-loaded `Game` row and pass it through to the `lib/ranking` calls in §5 — minimal direct changes. |
| `encounters/history.ts` | Add `squad` query param. |
| `user/scores.ts` | Needs a `squad` param — a player in both squads needs to pick which squad's "my scores" they're viewing (see §8). |
| `admin/players.ts` | Extend to read/write per-squad membership (the admin toggle from §2). |
| `pages/api/local/**` | **Out of scope.** Already vestigial per `CLAUDE.md` — do not extend it to support squads; it's slated for future removal, not further investment. |

## 7. Hooks and pages

- **Hooks** (`frontend/src/hooks/{useRankings,useRankingHistory,useGamePlayers,useGames,useLiveGames,useMyMatches,usePlayerEncounters,usePlayers,useAdminPlayers,useInactivePlayers,useEncounterHistory}.ts`): each currently takes no arguments and hits a static URL (e.g. `useRankings()` → `/api/rankings`). Every one of these needs a `squad` argument threaded into both the SWR cache key and the fetch URL's query string, so switching squads doesn't serve stale cached data from the other squad.
- **Routing** (Pages Router): introduce a `[squad]` dynamic segment, moving today's flat pages under it:
  - Public: `pages/[squad]/index.tsx`, `[squad]/encounter-history.tsx`, `[squad]/player-ranking-history.tsx`, `[squad]/player/[id]/encounters.tsx`.
  - Admin: `pages/[squad]/admin/{dashboard,game-planner,game-day,score-keeper,players}.tsx`.
  - Each of these pages/`getServerSideProps` validates `squad` against `SQUADS` (§4.1) and 404s on an unknown value.
  - Root `/` needs a decision — squad picker landing page vs. redirect to a default squad (see §8).
- **Nav**: `NavigationComponent.tsx` / `LayoutComponent.tsx` / `layout/Layout.tsx` need to carry the current squad through their internal links so navigating within a squad's pages doesn't drop back to a squad-less URL.
- **Unaffected** (identity, not standings): `login.tsx`, `user/management.tsx` — expected no change, confirm during implementation.

## 8. Open items for reviewers (not yet decided)

1. **Starting `rankScore` for a player added to a *second* squad.** Recommend: same as a brand-new player (`1000` default, admin can override) — i.e. no special-casing based on their other squad's score. Confirm or override.
2. **Root `/` behavior.** Squad picker page listing both, vs. redirect to a configured default squad. No recommendation yet — depends on which squad (if either) should be considered "primary" for people who land on the bare domain.
3. **Downtime tolerance for the §4.7 migration.** Assumed a brief maintenance-window migration is fine (small low-traffic app, no existing zero-downtime tooling). Flag if that assumption is wrong.
4. **`user/scores.ts` / "my scores" UX** for a player in both squads — tabs between squads on one page, or fully separate pages under each squad's path (consistent with the path-scoped routing decision in §2)? Recommend the latter for consistency; confirm.

## 9. Test plan

- Extend the `lib/ranking` unit tests with squad-isolation cases: two squads sharing a player ID, verify that an absence/demerit/deactivation processed in one squad produces **zero** row changes in the other squad's `PlayerSquadStanding`/`ScoreHistory`.
- `characterization.test.ts` stays as-is (still validates the Elo/absentee math itself, which is squad-agnostic) — no fixture changes expected.
- Manual verification of the §4.7 migration against a local copy of prod data (reusing the `brs-local-mysql` local-container approach from `MIGRATION_PLAN.md` Phase 1): confirm Wednesday standings are identical before/after, then manually exercise adding a test player to `FRIDAY` and confirm their Wednesday standing is untouched.

## 10. Phased implementation plan

1. **Phase 1 — Schema, additive only.** §4.1–4.6 additive changes + §4.7 steps 1–2 (add tables/columns, backfill `WEDNESDAY`). No behavior change yet; old `Player` columns still authoritative and unused-but-present.
2. **Phase 2 — Ranking-math layer.** §5, plus the new squad-isolation tests (§9). Internal only — API routes still call these with a hardcoded `'WEDNESDAY'` squad, so behavior is unchanged externally.
3. **Phase 3 — API routes + hooks.** §6 and §7's hooks changes, still defaulting to `'WEDNESDAY'` where no squad is supplied, so existing (not-yet-updated) pages keep working.
4. **Phase 4 — Routing restructure.** §7's `[squad]` page moves + nav updates. This is the user-visible cutover to path-scoped squads.
5. **Phase 5 — Admin membership + Friday rollout.** Admin players-page toggle (§2/§6), then actually add players to `FRIDAY` and start using it for real game days.
6. **Phase 6 — Cleanup.** §4.7 step 5 (drop the now-unused columns from `Player`). Also: `telegram/scheduleConfig.ts`'s `DaySchedule` gains a `squad: SquadId` field tying each poll to its target squad (low-risk, can happen any time — not blocking, since polls are still just fire-and-forget reminders today).

Each phase should land as its own PR/review, in this order — later phases depend on earlier ones being verified correct first.
