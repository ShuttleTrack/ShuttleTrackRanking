# Open-Slot & Replacement Players — Design Plan

**Status:** Approved and implemented (PR #203). This document stays as the design record — the reasoning behind the decisions, and the alternatives that were rejected — the way `MIGRATION_PLAN.md` does. For what the built system actually does, `frontend/docs/squad-tenancy.md`'s "Open-slot & replacement players" section is the living reference; where the two disagree, that one is current. Two deliberate departures from this plan as written: schema changes landed as a real Prisma migration rather than the `db push` mentioned under "Testing / verification" (per `CLAUDE.md`), and the `applyAbsenteeDeductions` / `absenteeSpellDays` / replacement-validation tests listed there are still outstanding — see PR #203's "Known gaps".

**Revision:** amended 2026-09-21 after a review pass against the actual implementation, then again to rework the replacement player's absentee treatment. The amendments are: the null-`rankScore` safety section (new, and the reason the nullable-column decision is no longer "low-risk additive"); the absentee sweep restructured into three explicit paths, with the two new ones on a day-based spell counter instead of the legacy row-based one and neither able to auto-deactivate; the replacement path given no grace cutoff but clamped so pre-window absences don't count; splitting the backward-looking day count off the schedule calculator; moving the scoreless-player gate server-side; a rewritten "why not separate tables" rationale; and a corrected testing section. The one open question the review raised — whether a fulltime player should keep accruing absentee demerits while a replacement covers their slot — has since been answered: **yes for now, deferred rather than settled** (see "Double liability for one slot"). No question remains outstanding that blocks starting implementation.

## Context

Today every `Player` row is implicitly a "fulltime" member: one flat roster per squad, ranked and absentee-swept identically. In practice two more player categories exist in real play:

- **Open-slot players** — fill a vacant spot when a fulltime player is absent. They get ranked normally when they play, but since they're not expected to show up every session, they should only accrue absentee demerits for a configurable grace period before the sweep stops penalizing them.
- **Replacement players** — an open-slot player a fulltime player has nominated to take over their slot for a date range (self-service, min. 3 playing days). During that window they're swept on the same escalating ladder as everyone else but with **no grace cutoff**: missing a playing day keeps costing them for as long as the window runs, which is the point of having claimed a guaranteed slot. They are never auto-deactivated, absences from before the window never count toward the ramp, and once the window closes they revert to plain open-slot behavior. The nominating fulltime player's own treatment is unchanged by this (confirmed for now, revisitable — see "Double liability for one slot") — the nomination's only purpose is to guarantee the replacement a slot instead of leaving it to opportunistic day-of vacancy.

This plan adds both categories, keeps everything in the existing `Player` table (evaluated separate tables — rejected, see below), and builds a schedule-derived "playing day" calculator as a reusable primitive for *forward-looking* date-range questions (the replacement's minimum-duration validation; a later, separate effort can migrate the main/fulltime deactivation logic — currently game-count-based — onto the same calculator with its own threshold).

Also in scope: since players can now exist without an initial rank score (open-slot admin-add, and future self-registration), the game-planner needs a blocking bulk-assign-score step before a game day can be created, **and** the ranking layer needs hard guards so a scoreless player can never reach the Elo or absentee math (see "Null-`rankScore` safety" — this is the single largest source of implementation risk in the plan).

**Explicitly out of scope for this plan** (per discussion): the public "browse squads / request to join as open-slot" self-service flow, and migrating fulltime players' deactivation logic onto the day-based calculator. Both are later work; this plan should not make either harder.

## Why not separate tables

Two separate questions got conflated in the first draft of this section. Taking them apart:

**Mechanically splitting `Player` into two tables while keeping both pools ranked together: rejected.** The id-space argument is real but secondary — `Encounter.team1`/`team2` are opaque colon-joined id strings in a `VARCHAR(32)` column with a `@@unique([squadId, team1, team2, encounterDate])` constraint over that string, `ScoreHistory.playerId` has no FK or discriminator, and the absentee sweep (`processEncountersForDate`) loads all `Player` rows in a squad indiscriminately. All of that is solvable (prefixed encoding, a shared id sequence, a `playerKind` column on `ScoreHistory`); only 6 files touch `prisma.player` at all, so the blast radius is not the deciding factor.

The deciding factor is that **an open-slot player is the same entity with the same lifecycle, and Elo requires a single ranked pool.** They play inside a skill tier against fulltime players, and beating one has to move both sides' `rankScore` *and* both sides' `playerRank`. So a second table would have to carry `rankScore`, `playerRank`, `highestRank`, `rankSince`, `playerStatus`, `colorHex` and `email` — essentially all of `Player` — and then `updatePlayerRanking` would need to union both tables, sort in memory, and write back in two loops. That is a duplicated entity, not a separation of concerns: it buys nothing and costs a discriminator on `ScoreHistory` plus a second id space threaded through the team strings. **Decision: single `Player` table + a `playerType` discriminator.**

**Separate table *plus* modified scoring logic — i.e. open-slot players are unranked guests: also rejected, but it is a genuine alternative and worth recording as considered.** In that model a guest's rating is a provisional *input* to `calculateElo` but never persisted, they never get a `playerRank` or `ScoreHistory`, they're never absentee-swept, and they never appear on the leaderboard. That version is strictly simpler than this plan — no nullable `rankScore` (and none of the null-safety work below), no grace-days setting, no visibility-window setting, no board filter, no bulk-assign step; roughly half this document disappears. It was rejected because it removes the ladder: a regular fill-in would have no ranking of their own and no visible progression toward a fulltime slot, which contradicts the stated requirement that open-slot players "get ranked normally when they play." Recorded here so the trade is explicit rather than implied — if the ladder turns out not to matter, this is the cheaper design and the decision should be revisited before implementation, not after.

## Data model changes (`frontend/prisma/schema.prisma`)

**`Player`**:
- Add `playerType PlayerType @default(FULLTIME) @map("player_type")` with a new Prisma enum `PlayerType { FULLTIME OPEN_SLOT }`. This is a genuinely new field (unlike the legacy free-string `playerStatus`), so use a real Prisma enum for type safety.
- **No `REPLACEMENT` value.** "Replacement" is a temporal state, not a category — it's derived from an active `SlotReplacement` row covering the current date, never stored as `playerType`. Storing it as a mutable type risks a stuck flag if a revert step is ever missed; deriving it is always correct. `playerType` is set once at creation and never changes.
- Change `rankScore Float @default(1000)` → `rankScore Float?` (nullable, no default). Fulltime players still always get a score at creation (existing `initialScore > 0` requirement in `players.ts:addPlayer` / the add-player API is unchanged for `FULLTIME`). Open-slot players (admin-added now, self-registered later) may be created with `rankScore: null`.
  - The *column* change is additive and safe (every existing row already has a non-null value). The **code** change is not: several ranking paths currently assume a non-null `Float` and break in non-obvious ways on null. Those guards are mandatory prerequisites, not follow-ups — see "Null-`rankScore` safety" below. Do not land the schema change without them.

**`Squad`**: add two admin-configurable per-squad settings (same settings surface as `maxPlayers`/`schedule` today, in `pages/s/[squad]/admin/settings.tsx` + `pages/api/squads/[squadId]/schedule.ts`-adjacent route) — kept as two separate fields since they answer different questions ("when do we stop penalizing?" vs "when do we stop displaying?") and there's no reason an admin would need them locked together:
- `openSlotAbsenteeGraceDays Int @default(3) @map("open_slot_absentee_grace_days")` — game days since an open-slot player's last game after which the absentee sweep stops demeriting them (see below). **Non-nullable with a real default**, changed from the first draft's `Int?`-meaning-disabled: a `null`-means-never-exempt default is the *worst* outcome for the feature, not the safest one — an admin who adds open-slot players without discovering the setting would get them demerited and auto-deactivated exactly as if the feature didn't exist. `3` is chosen because the ramp reaches its 3× maximum on the third missed day, so the default gives one full escalation cycle and then stops — a −60 ceiling per absence spell. Existing squads are unaffected either way: every existing player is `FULLTIME`, and this setting is only read on Path 3 of the sweep. Note this setting has **no effect on a replacement inside an active window** — Path 2 has no cutoff by design.
- `openSlotVisibilityGameDays Int @default(10) @map("open_slot_visibility_game_days")` — game days since an open-slot player's last game after which they drop off the public leaderboard/trajectory graph (see below). Defaults to 10, deliberately longer than the grace window: we stop penalizing well before we stop displaying, so a sporadic regular stays on the board without bleeding points.

**New model `SlotReplacement`** (real FK relations to `Player` are fine here — unlike `ScoreHistory`/`Encounter`, this is new code with no legacy anti-pattern to preserve, and player deletion isn't implemented):
```prisma
model SlotReplacement {
  id                  Int       @id @default(autoincrement())
  squadId             Int       @map("squad_id")
  fulltimePlayerId    Int       @map("fulltime_player_id")
  replacementPlayerId Int       @map("replacement_player_id")
  startDate           DateTime  @map("start_date") @db.Date
  endDate             DateTime  @map("end_date") @db.Date
  createdByEmail      String    @map("created_by_email")
  cancelledAt         DateTime? @map("cancelled_at")
  createdAt           DateTime  @default(now()) @map("created_at")

  squad             Squad  @relation(fields: [squadId], references: [id])
  fulltimePlayer    Player @relation("SlotOwner", fields: [fulltimePlayerId], references: [id])
  replacementPlayer Player @relation("SlotFiller", fields: [replacementPlayerId], references: [id])

  @@index([squadId])
  @@index([fulltimePlayerId])
  @@index([replacementPlayerId])
  @@map("SLOT_REPLACEMENT")
}
```
"Active on date D" = `startDate <= D <= endDate && cancelledAt === null`.

Two mechanical notes on this model: `Player` and `Squad` have **no relation back-references today**, so this also adds `slotOwnerReplacements SlotReplacement[] @relation("SlotOwner")` / `slotFillerReplacements SlotReplacement[] @relation("SlotFiller")` to `Player` and `slotReplacements SlotReplacement[]` to `Squad` — Prisma requires both sides. And **MySQL cannot express "no overlapping ranges" as a constraint**, so the non-overlap guardrail is application-level only: do the overlap check and the insert inside one `prisma.$transaction` so two concurrent nominations can't both pass.

**Guardrails to validate on create** (in the new API route, see below): the nominating email must match `fulltimePlayer.email`; nominee must be `playerType === OPEN_SLOT`; no overlapping active `SlotReplacement` for the same `fulltimePlayerId` or the same `replacementPlayerId`; squad must have a schedule configured (see calculator below); range must cover ≥ 3 playing days.

## Null-`rankScore` safety (prerequisite for the schema change)

Making `rankScore` nullable is the riskiest part of this plan, because `absentPlayerIds` in `processEncountersForDate` is built from **every** player in the squad — so a brand-new, never-played open-slot player reaches the ranking math on the very next game day whether or not an admin ever selected them for a game. Three concrete failures, all of which must be fixed in the same change as the column:

**1. The absentee sweep throws mid-run and leaves the game day half-processed.** `applyAbsenteeDeductions` (`scorePersister.ts:125-158`) does `player.rankScore + decision.points` — in JS `null + -10` is `-10`, so the player silently acquires a score of −10 — and then `insertScoreHistory(..., oldRankScore: player.rankScore, ...)` writes `null` into the non-null `old_rank_score` `Float` column, which Prisma rejects. The per-player loop is **not** wrapped in a single transaction, so the throw leaves some players demerited, some not, and `updatePlayerRanking` never runs at all — a state that has to be repaired by hand.
- **Fix**: `applyAbsenteeDeductions` skips any player with `rankScore === null` outright, *before* the type/replacement branch. A player with no score has nothing to deduct from and no meaningful history row to write. This is also the correct product behavior, so it is not merely defensive.

**2. A scoreless player can reach the Elo calculation, and the gate as originally specified wouldn't stop them.** The first draft put the check only in `handleCreateGameDay` on the client. But `POST /api/squads/[squadId]/games` does no validation on group membership at all (`games/index.ts:19-23`), and neither does `games/[id]/submit.ts` — so an edited game, a direct API call, or any path that doesn't go through the planner button gets straight to `calculateAndPersistElo`, where `team1Players.reduce((s, p) => s + p.rankScore, 0)` pollutes the average and `isScoreGapLargeEnoughForDate`'s `Math.max`/`Math.min` coerce `null` to `0` — which would push the day-wide gap over `TIER_BOOST_MIN_SCORE_GAP` (200) and fire the tier boost on essentially every match of the day.
- **Fix**: the real gate is server-side in `POST /api/squads/[squadId]/games` (and the update path) — reject with 400 if any player id in `groups` has `rankScore === null`, naming them. Additionally, `calculateAndPersistElo` throws if any participant has a null score: it is never correct to compute an encounter with one, and failing loudly at the boundary beats writing a quietly wrong `calculatedScore` and `scoreBreakdown`. The planner's bulk-assign panel stays as the friendly path, not the boundary.

**3. `getRankedPlayers` returns an arbitrary permutation of the *whole* list, not just the scoreless rows.** `getAvailablePlayersForGame` (`players.ts:322-323`) filters only on `playerStatus !== 'DISABLED'`, so a scoreless open-slot player flows into `getRankedPlayers`, whose comparator is `b.rankScore - a.rankScore` → `NaN`. An inconsistent comparator lets the sort produce any permutation, so the rank-order tier slicing becomes non-deterministic for every player on the day — the opposite of the determinism `calculateGroupDistribution` was designed for.
- **Fix**: make `RankablePlayer.rankScore` `number | null` and give the comparator an explicit total order with nulls last, rather than relying on arithmetic:
  ```ts
  .sort((a, b) => {
    if (a.rankScore === null && b.rankScore === null) return 0;
    if (a.rankScore === null) return 1;
    if (b.rankScore === null) return -1;
    return b.rankScore - a.rankScore;
  })
  ```
  Note `?? -Infinity` does **not** work here: `-Infinity - -Infinity` is `NaN`, so two scoreless players reintroduce the same bug. With no nulls present this is byte-identical to today's behavior, which is what keeps the game-day ordering unchanged for existing squads.

`updatePlayerRanking` needs no guard — it filters to `playerStatus === 'ACTIVE'`, and a scoreless player isn't ACTIVE until they've actually played. `activatePlayer`'s `currentMinActiveRankScore = Math.min(...activePlayers.map(p => p.rankScore))` is likewise safe for the same reason, but should filter nulls defensively since it's one line.

## Core primitive: schedule-derived playing-day calculator

New file `frontend/src/lib/scheduling/playingDayCalculator.ts` — pure, squad-agnostic, takes the existing `SquadScheduleData` shape from `squadSchedule.ts` (today: one `dayOfWeek`, `startTime`/`endTime`, optional `startDate`/`endDate`, `skipDates`). No player/absentee/type awareness, so it's reusable later for the fulltime migration mentioned above.

- `isPlayingDay(schedule, date): boolean` — date's day-of-week matches `schedule.dayOfWeek`, within `startDate`/`endDate` if set, not in `skipDates`.
- `countPlayingDaysBetween(schedule, fromExclusive, toInclusive): number` — iterates the range counting `isPlayingDay` hits.
- `getPlayingDatesInRange(schedule, from, to): Date[]` — for surfacing the resolved dates in the nomination UI.

Squads currently support only one playing day/week — the calculator is written against that shape now; extending it for multiple days/week later is a schedule-model change, not a calculator rewrite.

**Scope correction from the first draft: this calculator is for _forward-looking_ questions only** — "does this proposed date range cover ≥ 3 playing days?" and "which dates does it resolve to?". It is *not* the right source for "how many game days since this player last played," for two reasons. `Squad.schedule` is explicitly informational — nothing reads it to create game days (see `docs/squad-tenancy.md`), it can be `null` or `isRecurring: false`, and the real production squad may not have one configured. And the absentee sweep only runs when an admin presses Process, so a cancelled session that nobody added to `skipDates` counts as a playing day to the calculator while producing no sweep — the grace counter would drift ahead of the escalation counter, which keys off actual `ScoreHistory` rows. See the backward-looking helper below.

**Guard**: the replacement-nomination path must require `squad.schedule` to be set and recurring; if absent, surface a clear error ("configure the squad's playing schedule first") rather than guessing. The absentee sweep must **not** depend on the schedule at all — it has to keep working for squads that never configured one.

## Backward-looking helper: game days since last play

Both the absentee grace check and the board-visibility rule need "how many game days since this player last actually played." The ground truth for that is already in the database and needs no schedule: **the count of distinct `Encounter.encounterDate` values for the squad that fall after the player's last participation date.** That matches the absentee sweep's own clock exactly (one sweep per processed encounter date), works for squads with no schedule, and can't drift.

New function `gameDaysSinceLastPlay(squadId, playerId, asOf): number | null` in the ranking layer — finds the player's most recent actual encounter participation (their most recent `ScoreHistory` row with a real `encounterId > 0`, i.e. excluding the `-1`/`-2`/`-3` absentee/deactivate/activate sentinels), then counts distinct squad encounter dates strictly after it and up to `asOf`. Returns `null` if they've never played, so callers can distinguish "never played" from "played long ago".

The absentee sweep needs one variant of this, so implement it as the general form and let `gameDaysSinceLastPlay` be the no-argument case:

`absenteeSpellDays(squadId, playerId, asOf, notBefore?): number | null` — the count of distinct squad game days in `(max(lastRealPlayDate, the game day before notBefore), asOf]`. In words: **consecutive missed game days, optionally clamped so that nothing before `notBefore` counts.** With no `notBefore` it is exactly `gameDaysSinceLastPlay`. With `notBefore = window.startDate` it answers "how many game days of this replacement window have they missed in a row," ignoring however long they were dormant beforehand. Returns `null` only when the player has never played *and* no clamp was given.

Three call sites, one implementation: the open-slot grace check (unclamped), the replacement ramp (clamped to the window start), and the board-visibility rule (unclamped).

## Absentee sweep changes

`processEncountersForDate` (`frontend/src/lib/ranking/processEncounters.ts`) keeps building `absentPlayerIds` exactly as today (every squad player not in one of the day's encounters). The change is inside `applyAbsenteeDeductions` (`scorePersister.ts`): after the null-`rankScore` skip from the section above, each absent player takes one of **three** paths.

### Two counters, deliberately different

The existing `decideAbsenteeAction` counts absentee rows among a player's **last 5 `ScoreHistory` rows**. That counter is row-based, which makes it distorted in two ways: a single game day writes 3–4 rows per player (one per match — 3 in a group of 4, 4 in a group of 5), so playing once floods the window and all but resets the count; and because a skipped sweep writes no row, stale absentee rows from a dormancy spell months earlier stay in the window and pre-load the ramp. Both are acceptable for fulltime players only because that is the behavior running in production today and it must not change.

Neither new path inherits those distortions: they use the **day-based** `absenteeSpellDays` helper defined above, with the multiplier derived from it — `1` at 1 day, `2` at 2, `3` at 3 or more, times `DEMERIT_POINTS_ABSENTEE` (−10). Same familiar −10/−20/−30 amounts, deterministic counter. Extract that as a pure `absenteeMultiplierForSpell(spellDays)` alongside `decideAbsenteeAction` rather than reusing the latter, so the legacy row-based function is left completely untouched.

### Path 1 — `FULLTIME`: unchanged

`decideAbsenteeAction` on the row-based counter: escalating 1×/2×/3×, auto-deactivate at 5 prior absences. Byte-identical to production for all pre-existing data — this is a new branch beside it, not a rewrite of it.

### Path 2 — `OPEN_SLOT` under an active `SlotReplacement` covering today

Escalating demerit from `absenteeSpellDays(squadId, playerId, today, window.startDate)`, with **no cutoff** and **no deactivation**: it reaches 3× on the third consecutive missed playing day and stays at −30 for every remaining playing day of the window. Having claimed a guaranteed slot, the cost of not using it doesn't taper off.

Two consequences of the `startDate` clamp, both intended:
- **Absences before the window never count.** The ramp always starts at 1× on the first missed day of the window, however long the player was dormant beforehand. Without the clamp a long-dormant nominee would arrive with a window full of frozen absentee rows, start at 3× on day one, and hit the fulltime deactivation threshold by day three of their own window — an outcome driven entirely by where their *previous* dormancy spell happened to land in a 5-row buffer.
- **Playing inside the window resets the ramp.** Their last real play moves forward, so the next miss starts at 1× again. Not gameable in any useful way: showing up beats a −10 demerit regardless.

### Path 3 — `OPEN_SLOT` with no active replacement

`absenteeSpellDays` unclamped (i.e. `gameDaysSinceLastPlay`):
- Never played (`null`) → **skip**. No deduction, no `ScoreHistory` row.
- Greater than `squad.openSlotAbsenteeGraceDays` → **skip**. A rolling exemption, not a one-time onboarding grace: it resets the moment they play again, matching "by design they do not join every day."
- Otherwise → the escalating demerit, **no deactivation**.

### Side by side

Consecutive missed playing days, starting from a day the player last played, at the default `openSlotAbsenteeGraceDays = 3`:

| missed game day | Path 1 · fulltime | Path 2 · active window | Path 3 · open slot |
|---|---|---|---|
| 1 | −10 | −10 | −10 |
| 2 | −20 | −20 | −20 |
| 3 | −30 | −30 | −30 |
| 4 | −30 | −30 | skip |
| 5 | −30 | −30 | skip |
| 6 | **DISABLED** | −30 | skip |
| 7+ | — | −30, to `endDate` | skip |
| net | −140, then deactivated | −30/day for the window's length | −60, then frozen |

When a window closes, the player falls to Path 3. If they no-showed the whole window their last real play is far behind, so `absenteeSpellDays > graceDays` and the penalty stops immediately — they're left with the accumulated loss and a frozen score rather than a deactivation. This is the "punishes absentee more, but only for the window" shape: a no-show replacement pays roughly a fulltime player's rate for as long as they held the slot, and nothing after.

(Path 1's row for day 7+ is left blank because the player is already `DISABLED` by then. For completeness: the sweep keeps running on them, the `-2` DISABLE row displaces one absentee row from the 5-row window, pinning `priorAbsences` at 4, so a deactivated fulltime player bleeds −30 indefinitely. Pre-existing, invisible — they're off the board and out of the planner — and untouched by this plan.)

### Why neither new path deactivates

An open-slot player who stops showing up must not end up `DISABLED`: that state is hard to escape here. They drop out of `getAvailablePlayersForGame` (which excludes `DISABLED`), and `players/[id]/activate.ts` always calls `activatePlayer(squadId, id, null)`, whose auto-score path throws outright when there is no prior active game. Deactivating an open-slot player stays an explicit admin action. It follows that neither Path 2 nor Path 3 may route through `decideAbsenteeAction`'s deactivate arm — which, note, is also why the day-based counter isn't merely a tidiness preference: on the row-based counter any `openSlotAbsenteeGraceDays > 4` would have been unreachable, because deactivation fires on the 6th missed day before the grace cutoff ever gets evaluated.

The day-based `absenteeSpellDays` is also the natural primitive for the already-out-of-scope follow-up that migrates fulltime deactivation off the game-count ladder — one more reason to land it in this shape now.

No changes needed to `eloCalculator.ts` or `updatePlayerRanking` — they stay type-agnostic exactly as today. (`getRankedPlayers` *does* change, but for null-safety, not for player type — see above.)

## Bulk initial rank-score assignment (game-planner)

Any player (open-slot admin-added without a score, or future self-registered) can now have `rankScore === null`. They remain selectable in the game-planner's player picker, but **group creation must block** until every selected player has a score — single bulk action, not per-player prompts. The authoritative block is the server-side check in the game-create route (see "Null-`rankScore` safety" item 2); the client panel below is the usable path to satisfying it.

- In `pages/s/[squad]/admin/game-planner.tsx`'s `handleCreateGameDay`: after the existing rank-sort/filter, check `selectedPlayerDetails.some(p => p.rankScore == null)`. If any, open a bulk-assign panel instead of proceeding — listing exactly those players, each row prefilled with the squad's current minimum active `rankScore` (the same quantity `scorePersister.ts`'s `activatePlayer` computes as `currentMinActiveRankScore` and feeds to `activation.ts` — note this lives in `scorePersister.ts`, not `players.ts` as the first draft stated), editable per row before submit.
- New API route `POST /api/squads/[squadId]/players/bulk-initial-score` (squad-admin gated), taking `[{ playerId, rankScore }]`; new `lib/ranking/players.ts` function `assignInitialScores(squadId, assignments)` — sets `rankScore`, assigns `playerRank` (reuse `addPlayer`'s "next rank after current max active rank" logic), sets `rankSince`, and normalizes `playerStatus` to `'ENABLED'` if still null, mirroring what `addPlayer` does today for a brand-new fulltime player. Validates `rankScore > 0` per row, matching the add-player route's existing rule, and that every id belongs to this squad.
- Once the bulk action succeeds, `handleCreateGameDay` re-runs with all selected players now scored and proceeds exactly as today — no changes to `calculateGroupDistribution` or the rank-order slicing.
- `getAvailablePlayersForGame`/`getRankedPlayers` need their TypeScript signatures updated for `rankScore: number | null` (Prisma forces this at every call site once the field is nullable). **Correction to the first draft**: this is not signature-only. `getRankedPlayers` needs the real comparator fix above, and the public ranking board does *not* "already only surface ranked/`ACTIVE` players" — `/api/squads/[squadId]/rankings` calls `getPlayers(squadId)` with no status filter and computes its stats over everyone; only the client component filters `playerRank > 0`. See the leaderboard section.

## Self-service replacement nomination

- New player-facing page `pages/s/[squad]/user/replacement.tsx`, gated like `user/matches.tsx` via `resolveSquadUserOrRedirect`, restricted further to the resolved player being `playerType === FULLTIME` (an open-slot player has no slot to give away). Note `resolveSquadUserOrRedirect` also admits a platform superadmin with no `Player` row (`playerId: null`) — this page must handle that case rather than assuming a player.
- Search: new `GET /api/squads/[squadId]/players/open-slot?query=` (reuses existing roster query, filtered to `playerType === OPEN_SLOT`, matched by name/email) for the name-or-email nominee search.
- Form: nominee + start date + end date. Client calls the same validation the server enforces so the UI can show "X playing days selected, need 3" before submit.
- New API `POST /api/squads/[squadId]/replacements`: verifies session email === the fulltime player's own email (can only give away your own slot), runs all the guardrails listed under the schema section (schedule present and recurring, ≥3 playing days via the calculator, nominee is OPEN_SLOT, no overlap for either player) with the overlap check and insert in one transaction, creates the `SlotReplacement` row.
- New API `PATCH/DELETE /api/squads/[squadId]/replacements/[id]` for the nominating player to cancel/shorten early (`cancelledAt`/adjusted `endDate`), same identity check.
- Admin visibility: add a read-only list of active/past `SlotReplacement`s to the admin players page (or a new small admin sub-view) so admins can see/cancel these too — useful for support/dispute cases even though creation itself is self-service.

**Scoreless nominee**: a nominee who has never played has `rankScore === null`, so the null-`rankScore` skip in `applyAbsenteeDeductions` fires before the replacement path is ever reached. The effective rule is therefore: a replacement who has never played accrues nothing until their first game. That is the right outcome — there's no score to deduct from — but it means the window's teeth only come out once they've played once. Worth stating in the nomination UI.

**Double liability for one slot — decided for now: the owner keeps losing points.** The nominating fulltime player's own absentee treatment is unchanged while their replacement is active (they stay on Path 1), and the replacement is swept on Path 2. Confirmed deliberately, so implementation should build it this way and not treat it as unresolved.

The consequence, recorded so it isn't rediscovered as a bug later: a game day that *neither* attends costs the squad two absentee demerits for one physical slot, and the nominating player is penalized for an absence they had arranged cover for. Nothing prevents the owner from playing during their own replacement window either, in which case both are swept on any day neither shows.

Whether that should change is **explicitly not decided yet** — deferred, not rejected. The alternative (exempt the owner for the duration of a window they created) is a one-line addition to the same branch, needs no schema or counter changes, and can be made later without touching anything else in this plan. Nothing here should be built in a way that makes it harder: keep the owner's Path 1 dispatch in the same `switch`/branch as the replacement lookup, so "is there an active window naming me as `fulltimePlayerId`?" is already in scope at the point the decision would be applied.

## Game-planner player selection UI

The available-players picker in `pages/s/[squad]/admin/game-planner.tsx` splits into two groups rather than one flat list, so the admin can find the right pool quickly:

1. **Full-time roster** — `playerType === FULLTIME`, plus any `OPEN_SLOT` player currently under an **active** `SlotReplacement` for today (they're standing in for a permanent slot right now, so they belong with the regular roster for selection purposes).
2. **Open slot** — `OPEN_SLOT` players with no active replacement today.

This is a display/grouping split only in `getAvailablePlayersForGame`'s consumer (or a thin wrapper around it) — selection still feeds `handleCreateGameDay` exactly as today (flat list of selected ids, sorted by `playerRank` into groups). Scoreless players sort last within their group (per the comparator fix above) and are visually flagged as "needs a score", so the admin sees the bulk-assign step coming before they hit the button. This is a stopgap until a real per-day availability system exists; noted as something to revisit once that lands.

## Keeping the public leaderboard & score graph uncluttered

Open-slot players get real `rankScore`/`playerRank`/`ScoreHistory` when they play (required for the elo math), and under the day-based grace exemption above they're deliberately **not** auto-deactivated just for going quiet — so left unfiltered, they'd permanently clutter the two squad-wide aggregate views:

- The public leaderboard: `RankingsComponent.client.tsx` filters to `playerRank > 0`, but that is a *client-side* filter only. The backing `/api/squads/[squadId]/rankings` endpoint calls `getPlayers(squadId)` with **no status filter** and computes `totalPlayers`/`topScore`/`averageScore` over every player it gets (`rankings/index.ts:30-33`). Those stats are therefore already wrong today: `toPlayerInfo` nulls out `rankScore` for any non-`ACTIVE` player, and `players.reduce((acc, p) => acc + p.rankScore!, 0)` adds `null` as `0`, so every inactive player drags `averageScore` down and inflates `totalPlayers`. Open-slot players make an existing bug worse rather than introducing a new one — fixing the stats is in scope here because this plan is what makes it visible.
- The ranking-history trajectory graph and its player picker (`RankingHistoryView.tsx` / `RankTrajectoryChart`, fed by `getAllPlayersHistory`, which today includes every `playerStatus === 'ACTIVE'` player as a background line).

**Fix**: one shared predicate, `isBoardVisible(player, asOf)`:
- `playerType === FULLTIME` → always visible.
- Currently covered by an active `SlotReplacement` → always visible (standing in as fulltime).
- `playerType === OPEN_SLOT`, no active replacement, never played (`gameDaysSinceLastPlay` returns `null`) → **not visible**. (Already true today as a side effect of `playerRank`/`playerStatus` being unset pre-first-game — calling it out explicitly here so the new filter doesn't accidentally regress it, not because it needs new code.)
- `playerType === OPEN_SLOT`, no active replacement, has played → visible only while `gameDaysSinceLastPlay(squadId, playerId, today) <= squad.openSlotVisibilityGameDays` (default 10 game days since their last game; separate setting from the absentee-grace one, since "stop penalizing" and "stop displaying" are independent admin decisions). Once exceeded, they drop off the board/graph but nothing else about their record changes — they reappear immediately the next time they play.

Reused in three places: the game-planner grouping (above), and:
- `pages/api/squads/[squadId]/rankings/index.ts`: filter with it, and compute `totalPlayers`/`topScore`/`averageScore` only over players that both pass the filter and have a non-null `rankScore` — replacing the `rankScore!` non-null assertions with a real guard rather than relying on `null`-coerces-to-`0`.
- `getAllPlayersHistory` (`lib/ranking/players.ts`) / `rankingHistoryService.ts`: same filter in place of the current bare `isActive` check.

This is additive filtering only — no change to how `rankScore`/`playerRank`/`ScoreHistory` are computed or stored, just to which players surface on these two views (plus the stats correction above). Open-slot players remain fully visible on the admin roster (`players.tsx`, which needs to see them to manage them) and reachable individually via their own profile/encounter-history pages regardless of this filter.

## Admin UI changes

- `pages/s/[squad]/admin/players.tsx` + `AddPlayerModal`: add a Fulltime/Open-Slot type selector. Fulltime keeps the current required-score field; Open-Slot makes the score field optional ("assign later at game time" note). Roster table gets a type badge/column, and a "needs a score" marker for scoreless rows. The add-player route's existing `initialScore === undefined || initialScore <= 0` rejection stays as-is for `FULLTIME` and is relaxed only for `OPEN_SLOT`.
- Squad settings page: new "Open-slot absentee grace (game days)" and "Open-slot visibility window (game days)" fields wired to `openSlotAbsenteeGraceDays` / `openSlotVisibilityGameDays`. Both need adding to the `GET /api/squads/[squadId]` response shape (which currently hand-unpacks each field) as well as a PATCH path — squad-admin gated like `schedule`, not superadmin-only like `maxPlayers`.

## `frontend/docs/squad-tenancy.md`

Per `CLAUDE.md`, this is a squad-level Player-model change and must be documented in the same change as the implementation: add a section covering `playerType`, the derived (not stored) replacement state, `SlotReplacement`, the playing-day calculator and the separate backward-looking game-day counter (and why they're separate), and the new squad settings. Add the self-registration flow to the existing "out of scope so far" list explicitly.

## Testing / verification (for the implementation PR, once this design is approved)

- `npx prisma generate` after schema changes; `npx prisma db push` to apply (no migration history per existing convention).
- **Correction to the first draft: `characterization.test.ts` is not a safety net for this change.** It must of course still pass unmodified, but it only exercises the *pure* functions `calculateElo`, `decideAbsenteeAction` and `computeActivationScore` — the fixtures contain no player rows and the test never calls `applyAbsenteeDeductions`, which is the function actually being modified. It will pass regardless of what the new branch does. The real gate is the new tests below.
- **New tests for `applyAbsenteeDeductions` itself** (the function has no test coverage today — this is the coverage the change depends on), one per path:
  - *Path 1*: a fulltime player's path is unchanged across all five escalation steps including deactivation at 5; **and a fulltime player with an active replacement covering today is still swept on Path 1 exactly as if they had no replacement** — the decided-for-now rule, worth pinning in a test precisely because it's the one we may later choose to reverse.
  - *Null guard*: a scoreless player is skipped with no `ScoreHistory` row written and no score mutation, and the sweep completes for the rest of the roster.
  - *Path 3*: an open-slot player inside the grace window gets the escalating demerit and is **never** deactivated at step 6; past the grace window they're skipped; the exemption resets after they play; a never-played open-slot player with an assigned score is skipped.
  - *Path 2*: a replacement inside an active window ramps −10/−20/−30 and then stays at −30 past day 6 without deactivating; a nominee carrying frozen absentee rows from an earlier dormancy spell still starts at 1× on the window's first missed day (the `startDate` clamp — this is the regression test for the pre-loading bug); playing mid-window resets the ramp; the day after `endDate` they fall to Path 3 and, having not played, are skipped.
- New tests for `absenteeMultiplierForSpell`: pure, 1/2/3 at 1/2/3+ days, and that it produces the same amounts as the legacy ladder's first three steps.
- New unit tests: `playingDayCalculator.test.ts` (pure logic, same style as `game-planner.logic.test.ts`) covering weekly recurrence, `skipDates`, and range boundaries.
- New tests for `absenteeSpellDays`: never-played + no clamp returns `null`, sentinel `ScoreHistory` rows (`-1`/`-2`/`-3`) are excluded when finding the last real participation, the unclamped count matches distinct squad encounter dates after that point, and a `notBefore` clamp later than the last play wins (while one earlier than it is a no-op).
- New tests for `getRankedPlayers` null-safety: ordering with no nulls is identical to today's output, nulls sort last, and two nulls don't destabilize the sort.
- New tests for replacement validation: <3 playing days rejected, overlap rejected, non-open-slot nominee rejected, wrong-requester-identity rejected, missing/non-recurring squad schedule rejected.
- New test for the server-side game-create gate: `POST /games` with a scoreless player in `groups` is rejected with 400 and names the player.
- Manually run through the game-planner flow with a mix of scored/unscored selected players to confirm the bulk-assign gate blocks correctly and group distribution is unaffected once scores are set. Then process a game day with a never-played open-slot player on the roster but *not* in any group, to confirm the sweep completes rather than throwing part-way.
