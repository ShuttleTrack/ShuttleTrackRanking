# Open-Slot & Replacement Players — Design Plan

**Status:** Proposed — pending review/approval. No implementation yet; this document is the design to be reviewed before any code changes land.

## Context

Today every `Player` row is implicitly a "fulltime" member: one flat roster per squad, ranked and absentee-swept identically. In practice two more player categories exist in real play:

- **Open-slot players** — fill a vacant spot when a fulltime player is absent. They get ranked normally when they play, but since they're not expected to show up every session, they should only accrue absentee demerits for a configurable grace period before the sweep stops penalizing them.
- **Replacement players** — an open-slot player a fulltime player has nominated to take over their slot for a date range (self-service, min. 3 playing days). During that window the replacement is fully absentee-liable like a fulltime player; outside it, they revert to open-slot behavior. The nominating fulltime player's own treatment is unchanged by this — the nomination's only purpose is to guarantee the replacement a slot instead of leaving it to opportunistic day-of vacancy.

This plan adds both categories, keeps everything in the existing `Player` table (evaluated separate tables — not safe, see below), and builds a schedule-derived "playing day" calculator as a reusable primitive (open-slot's grace window is the first consumer; a later, separate effort can migrate the main/fulltime deactivation logic — currently game-count-based — onto the same calculator with its own threshold).

Also in scope: since players can now exist without an initial rank score (open-slot admin-add, and future self-registration), the game-planner needs a blocking bulk-assign-score step before a game day can be created.

**Explicitly out of scope for this plan** (per discussion): the public "browse squads / request to join as open-slot" self-service flow, and migrating fulltime players' deactivation logic onto the day-based calculator. Both are later work; this plan should not make either harder.

## Why not separate tables

`Player.id` is threaded through the ranking system as an untyped plain integer with no polymorphism: `Encounter.team1`/`team2` are opaque colon-joined id strings (`playerUtil.encodeTeamIds`), `ScoreHistory.playerId` has no FK at all, and the absentee sweep (`processEncountersForDate`) loads *all* `Player` rows in a squad indiscriminately. Splitting into separate tables would mean reworking team-id encoding, `ScoreHistory` linkage, and the roster-wide sweep to disambiguate id-spaces — far riskier than one extra column. **Decision: single `Player` table + a `playerType` discriminator.**

## Data model changes (`frontend/prisma/schema.prisma`)

**`Player`**:
- Add `playerType PlayerType @default(FULLTIME) @map("player_type")` with a new Prisma enum `PlayerType { FULLTIME OPEN_SLOT }`. This is a genuinely new field (unlike the legacy free-string `playerStatus`), so use a real Prisma enum for type safety.
- **No `REPLACEMENT` value.** "Replacement" is a temporal state, not a category — it's derived from an active `SlotReplacement` row covering the current date, never stored as `playerType`. Storing it as a mutable type risks a stuck flag if a revert step is ever missed; deriving it is always correct. `playerType` is set once at creation and never changes.
- Change `rankScore Float @default(1000)` → `rankScore Float?` (nullable, no default). Fulltime players still always get a score at creation (existing `initialScore > 0` requirement in `players.ts:addPlayer` / the add-player API is unchanged for `FULLTIME`). Open-slot players (admin-added now, self-registered later) may be created with `rankScore: null`. This is a low-risk, additive schema change — every existing row already has a non-null value.

**`Squad`**: add two admin-configurable per-squad settings (same settings surface as `maxPlayers`/`schedule` today, in `pages/s/[squad]/admin/settings.tsx` + `pages/api/squads/[squadId]/schedule.ts`-adjacent route) — kept as two separate fields since they answer different questions ("when do we stop penalizing?" vs "when do we stop displaying?") and there's no reason an admin would need them locked together:
- `openSlotAbsenteeGraceDays Int? @map("open_slot_absentee_grace_days")` — playing days since an open-slot player's last game after which the absentee sweep stops demeriting them (see below). `null` = feature effectively disabled (no exemption ever kicks in) until an admin sets it, so existing squads see no behavior change on migration.
- `openSlotVisibilityGameDays Int @default(10) @map("open_slot_visibility_game_days")` — playing days since an open-slot player's last game after which they drop off the public leaderboard/trajectory graph (see below). Defaults to 10 out of the box (not opt-in like the grace field above) since it's presentation-only and low-risk either way.

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

**Guardrails to validate on create** (in the new API route, see below): the nominating email must match `fulltimePlayer.email`; nominee must be `playerType === OPEN_SLOT`; no overlapping active `SlotReplacement` for the same `fulltimePlayerId` or the same `replacementPlayerId`; squad must have a schedule configured (see calculator below); range must cover ≥ 3 playing days.

## Core primitive: schedule-derived playing-day calculator

New file `frontend/src/lib/scheduling/playingDayCalculator.ts` — pure, squad-agnostic, takes the existing `SquadScheduleData` shape from `squadSchedule.ts` (today: one `dayOfWeek`, `startTime`/`endTime`, optional `startDate`/`endDate`, `skipDates`). No player/absentee/type awareness, so it's reusable later for the fulltime migration mentioned above.

- `isPlayingDay(schedule, date): boolean` — date's day-of-week matches `schedule.dayOfWeek`, within `startDate`/`endDate` if set, not in `skipDates`.
- `countPlayingDaysBetween(schedule, fromExclusive, toInclusive): number` — iterates the range counting `isPlayingDay` hits. Used for both the replacement's "≥ 3 playing days" validation and the open-slot grace countdown.
- `getPlayingDatesInRange(schedule, from, to): Date[]` — for surfacing the resolved dates in the nomination UI.

Squads currently support only one playing day/week — the calculator is written against that shape now; extending it for multiple days/week later is a schedule-model change, not a calculator rewrite.

**Guard**: any code path needing this (replacement validation, open-slot grace sweep) must require `squad.schedule` to be set; if absent, surface a clear error ("configure the squad's playing schedule first") rather than guessing from historical `Game`/`Encounter` dates.

## Absentee sweep changes

`processEncountersForDate` (`frontend/src/lib/ranking/processEncounters.ts`) keeps building `absentPlayerIds` exactly as today (every squad player not in one of the day's encounters). The only change is inside `applyAbsenteeDeductions` (`scorePersister.ts`): for each absent id, branch on player type + replacement status *before* deciding whether/how to deduct:

- `playerType === FULLTIME`, or `playerType === OPEN_SLOT` with an **active** `SlotReplacement` covering today → unchanged existing path: `decideAbsenteeAction` (game-count/last-5 escalation, auto-deactivate at 5). This must be byte-identical to current behavior for all pre-existing data (`characterization.test.ts` must still pass unmodified) — new branch, not new math.
- `playerType === OPEN_SLOT` with no active replacement → new day-based check: compute playing days elapsed (via `countPlayingDaysBetween`, using the shared "last played" helper below) since the player's last actual encounter participation, up to today. If that count exceeds the squad's `openSlotAbsenteeGraceDays`, **skip** — no deduction, no `ScoreHistory` row this sweep. Otherwise, fall through to the same `decideAbsenteeAction` math as fulltime (only the *cutoff*, not the per-hit deduction amount, differs for open-slot).
  - This is a **rolling** exemption, not a one-time grace period: it naturally resets the moment they play again, since "last played" moves forward — matching "by design they do not join every day" (ongoing sporadic attendance, not just an onboarding window).

No changes needed to `eloCalculator.ts`, `getRankedPlayers`, or `updatePlayerRanking` — they stay type-agnostic exactly as today.

**Shared "last played" helper**: both this grace check and the visibility rule below need "how many playing days since this player last actually played." New function, e.g. `gameDaysSinceLastPlay(squadId, playerId, asOf): number | null` in the same scheduling/ranking area — finds the player's most recent non-sentinel `ScoreHistory`/`Encounter` participation date, then runs it through `countPlayingDaysBetween`. Returns `null` if they've never played (distinguishes "never played" from "played long ago" for callers). One implementation, two call sites with two different configured thresholds.

## Bulk initial rank-score assignment (game-planner)

Any player (open-slot admin-added without a score, or future self-registered) can now have `rankScore === null`. They remain selectable in the game-planner's player picker, but **group creation must block** until every selected player has a score — single bulk action, not per-player prompts.

- In `pages/s/[squad]/admin/game-planner.tsx`'s `handleCreateGameDay`: after the existing rank-sort/filter, check `selectedPlayerDetails.some(p => p.rankScore == null)`. If any, open a bulk-assign panel instead of proceeding — listing exactly those players, each row prefilled with the squad's current minimum active `rankScore` (computed the same way `players.ts` already derives "min active rank score" for `activation.ts`), editable per row before submit.
- New API route `POST /api/squads/[squadId]/players/bulk-initial-score` (squad-admin gated), taking `[{ playerId, rankScore }]`; new `lib/ranking/players.ts` function `assignInitialScores(squadId, assignments)` — sets `rankScore`, assigns `playerRank` (reuse `addPlayer`'s "next rank after current max active rank" logic), sets `rankSince`, and normalizes `playerStatus` to `'ENABLED'` if still null, mirroring what `addPlayer` does today for a brand-new fulltime player.
- Once the bulk action succeeds, `handleCreateGameDay` re-runs with all selected players now scored and proceeds exactly as today — no changes to `calculateGroupDistribution` or the rank-order slicing.
- `getAvailablePlayersForGame`/`getRankedPlayers` need their TypeScript signatures updated for `rankScore: number | null` (Prisma will force this at every call site once the field is nullable) but no behavior change is needed outside the game-planner gate — the public ranking board already only surfaces ranked/`ACTIVE` players, and a scoreless player won't have those set yet.

## Self-service replacement nomination

- New player-facing page `pages/s/[squad]/user/replacement.tsx`, gated like `user/matches.tsx` via `resolveSquadUserOrRedirect`, restricted further to the resolved player being `playerType === FULLTIME` (an open-slot player has no slot to give away).
- Search: new `GET /api/squads/[squadId]/players/open-slot?query=` (reuses existing roster query, filtered to `playerType === OPEN_SLOT`, matched by name/email) for the name-or-email nominee search.
- Form: nominee + start date + end date. Client calls the same validation the server enforces so the UI can show "X playing days selected, need 3" before submit.
- New API `POST /api/squads/[squadId]/replacements`: verifies session email === the fulltime player's own email (can only give away your own slot), runs all the guardrails listed under the schema section (schedule present, ≥3 playing days via the calculator, nominee is OPEN_SLOT, no overlap for either player), creates the `SlotReplacement` row.
- New API `PATCH/DELETE /api/squads/[squadId]/replacements/[id]` for the nominating player to cancel/shorten early (`cancelledAt`/adjusted `endDate`), same identity check.
- Admin visibility: add a read-only list of active/past `SlotReplacement`s to the admin players page (or a new small admin sub-view) so admins can see/cancel these too — useful for support/dispute cases even though creation itself is self-service.

## Game-planner player selection UI

The available-players picker in `pages/s/[squad]/admin/game-planner.tsx` splits into two groups rather than one flat list, so the admin can find the right pool quickly:

1. **Full-time roster** — `playerType === FULLTIME`, plus any `OPEN_SLOT` player currently under an **active** `SlotReplacement` for today (they're standing in for a permanent slot right now, so they belong with the regular roster for selection purposes).
2. **Open slot** — `OPEN_SLOT` players with no active replacement today.

This is a display/grouping split only in `getAvailablePlayersForGame`'s consumer (or a thin wrapper around it) — selection still feeds `handleCreateGameDay` exactly as today (flat list of selected ids, sorted by `playerRank` into groups). This is a stopgap until a real per-day availability system exists; noted as something to revisit once that lands.

## Keeping the public leaderboard & score graph uncluttered

Open-slot players get real `rankScore`/`playerRank`/`ScoreHistory` when they play (required for the elo math), and under the day-based grace exemption above they're deliberately **not** auto-deactivated just for going quiet — so left unfiltered, they'd permanently clutter the two squad-wide aggregate views:

- The public leaderboard (`RankingsComponent.client.tsx` filters to `playerRank > 0`; the backing `/api/squads/[squadId]/rankings` endpoint computes `totalPlayers`/`topScore`/`averageScore` over every player it's given).
- The ranking-history trajectory graph and its player picker (`RankingHistoryView.tsx` / `RankTrajectoryChart`, fed by `getAllPlayersHistory`, which today includes every `playerStatus === 'ACTIVE'` player as a background line).

**Fix**: one shared predicate, `isBoardVisible(player, asOf)`:
- `playerType === FULLTIME` → always visible.
- Currently covered by an active `SlotReplacement` → always visible (standing in as fulltime).
- `playerType === OPEN_SLOT`, no active replacement, never played (`gameDaysSinceLastPlay` returns `null`) → **not visible**. (Already true today as a side effect of `playerRank`/`playerStatus` being unset pre-first-game — calling it out explicitly here so the new filter doesn't accidentally regress it, not because it needs new code.)
- `playerType === OPEN_SLOT`, no active replacement, has played → visible only while `gameDaysSinceLastPlay(squadId, playerId, today) <= squad.openSlotVisibilityGameDays` (default 10 playing days since their last game; separate setting from the absentee-grace one, since "stop penalizing" and "stop displaying" are independent admin decisions). Once exceeded, they drop off the board/graph but nothing else about their record changes — they reappear immediately the next time they play.

Reused in three places: the game-planner grouping (above), and:
- `pages/api/squads/[squadId]/rankings/index.ts`: filter `enrichedPlayers` with it, and compute `totalPlayers`/`topScore`/`averageScore` only over the filtered set (also fixes a latent issue: `rankScore!` non-null assertions there will need a null-safe guard regardless, since `rankScore` is now nullable).
- `getAllPlayersHistory` (`lib/ranking/players.ts`) / `rankingHistoryService.ts`: same filter in place of the current bare `isActive` check.

This is additive filtering only — no change to how `rankScore`/`playerRank`/`ScoreHistory` are computed or stored, just to which players surface on these two views. Open-slot players remain fully visible on the admin roster (`players.tsx`, which needs to see them to manage them) and reachable individually via their own profile/encounter-history pages regardless of this filter.

## Admin UI changes

- `pages/s/[squad]/admin/players.tsx` + `AddPlayerModal`: add a Fulltime/Open-Slot type selector. Fulltime keeps the current required-score field; Open-Slot makes the score field optional ("assign later at game time" note). Roster table gets a type badge/column.
- Squad settings page: new "Open-slot absentee grace (playing days)" and "Open-slot visibility window (playing days)" fields wired to `openSlotAbsenteeGraceDays` / `openSlotVisibilityGameDays`.

## `frontend/docs/squad-tenancy.md`

Per `CLAUDE.md`, this is a squad-level Player-model change and must be documented in the same change as the implementation: add a section covering `playerType`, the derived (not stored) replacement state, `SlotReplacement`, the playing-day calculator, and the new squad settings. Add the self-registration flow to the existing "out of scope so far" list explicitly.

## Testing / verification (for the implementation PR, once this design is approved)

- `npx prisma generate` after schema changes; `npx prisma db push` to apply (no migration history per existing convention).
- **Hard constraint**: `src/lib/ranking/characterization.test.ts` must pass unmodified — all fixture players are implicitly `FULLTIME` with no `SlotReplacement` rows, so the new branch must fall through to identical output.
- New unit tests: `playingDayCalculator.test.ts` (pure logic, same style as `game-planner.logic.test.ts`) covering weekly recurrence, `skipDates`, and range boundaries.
- New tests for the absentee-sweep branch: open-slot player exempted after grace window, exemption resets after they play, replacement player fully liable during an active window and exempted-per-open-slot-rules outside it.
- New tests for replacement validation: <3 playing days rejected, overlap rejected, non-open-slot nominee rejected, wrong-requester-identity rejected.
- Manually run through the game-planner flow with a mix of scored/unscored selected players to confirm the bulk-assign gate blocks correctly and group distribution is unaffected once scores are set.
