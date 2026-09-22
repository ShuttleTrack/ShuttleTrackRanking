# Game Day Attendance Vote & Open-Slot Assignment — Design Plan

**Status:** Proposed — not implemented. This document is up for review; the implementation follows in a separate PR once the decisions below are agreed. Same shape as `OPEN_SLOT_PLAYERS_PLAN.md` (PR #198, approved before its implementation PR #203) and `SELF_REGISTRATION_PLAN.md` (PR #207).

**Scope in one line:** give a squad a real **game day instance** — created two days ahead from its own schedule — that collects an in/out vote from whoever holds a slot that day, runs an open-slot waiting list for everyone else, cuts over at 13:00 to freeze attendance and fill the gap, and announces all of it to two per-squad Telegram groups.

## Context

A squad has **no entity for a future session**. `Squad.schedule` is a JSON blob that `frontend/docs/squad-tenancy.md` calls "informational only" — nothing reads it to *do* anything — and `lib/scheduling/playingDayCalculator.ts` can answer "is date D a playing day?" but only as a forward-looking validation helper for replacement windows. A `Game` row does not exist until an admin opens Game Planner **on the day** and ticks names by hand.

So the availability signal — the thing that decides whether there is a session at all — lives entirely outside the app. It is collected by `lib/telegram/sendEncounterPoll.ts`, a `sendPoll` fired by an in-process cron at 17:00 Europe/Amsterdam with options *In / In (from overflow) / Out / Out (slot passed to someone else)*. Those four options describe this domain almost exactly. **Nobody ever reads the answers back**: there is no webhook, no `getUpdates`, no poll-answer handler anywhere in the repo. The poll is fire-and-forget, and the admin reconstructs the night's roster by scrolling a chat thread.

`OPEN_SLOT_PLAYERS_PLAN.md` (#203) built the roster half of this — `PlayerType.FULLTIME | OPEN_SLOT`, and `SlotReplacement` for a fulltime player handing their slot to an open-slot player over a date range. But it stopped short of per-day availability, and said so: the game-planner's two-pool picker is "a stopgap grouping, **not a real per-day availability system**". This plan is that system.

**In scope:**

- A `GameDay` instance per squad per playing date, created `voteOpensDaysBefore` (default 2) days ahead.
- An in/out vote, from a shareable per-squad URL, restricted to whoever holds a slot that day.
- An open-slot waiting list, open from the moment the game day is created.
- A 13:00 cut-over that freezes the main vote, computes the shortfall, and assigns waiting-list players to it.
- Four Telegram announcements across two per-squad groups.
- Game Planner pre-selecting the confirmed players.

**Explicitly out of scope** (called out here so the follow-up PR isn't expected to carry them):

- **Removing the old Telegram poll.** It keeps running untouched alongside the new vote and is retired in a follow-up once this is proven in production (Decision 2).
- **Per-squad Telegram bot tokens.** One shared `TELEGRAM_BOT_TOKEN` in env, as today; only chat ids become per-squad.
- **Reading Telegram poll answers, or any inbound webhook.** Voting is in-app only.
- **Retargeting `submit.ts`/`process.ts` off `Game.createdAt`** onto `GameDay.gameDate` (see the `Game` link below).
- **More than one playing day per week.** `Squad.schedule` supports one; the mockup's two-slot list was mock data.
- **Per-player notifications of any kind.** Group messages only, as today.
- **Anything from `SELF_REGISTRATION_PLAN.md`.** The waiting list draws only on existing roster players, so the two efforts stay independent and can land in either order.

## The UI already exists: `feature/ui/cself-serve`

The visual design for this is done. It lives on a branch pushed under a typo'd name — **`feature/ui/cself-serve`**, not `self-serve` — so `git fetch origin` first and use the full remote ref. It is a complete, working check-in mockup with three mock layers standing in for this plan's backend:

| Mockup file | Fate |
|---|---|
| `pages/s/[squad]/game-day/[uid].tsx` | **Keep**, re-point at the real API |
| `components/check-in/CheckInView.tsx` · `CheckInVoteButtons.tsx` · `CheckInRoster.tsx` · `CheckInPlayerRow.tsx` | **Keep essentially as-is** — this is the design |
| `components/check-in/UpcomingSessionsList.tsx` | **Keep**, fed by the real upcoming-days endpoint |
| `components/nav/UserTabBar.tsx`, `utils/userTabBar.ts`, and the `Layout.tsx` / `_app.tsx` / `globals.css` edits | **Keep as-is** |
| `lib/check-in/schedule.ts` | **Rewrite** — hardcodes Wed 19:00–22:00 / Fri 20:00–23:00 and `Europe/Amsterdam`; must come from `Squad.schedule` |
| `lib/check-in/mockVotes.ts` (+ its test) | **Delete** — deterministic fake votes for other players |
| `lib/check-in/storage.ts` | **Delete** — the vote is in `localStorage` |
| `hooks/useGameDayCheckIn.ts` | **Rewrite** as an SWR hook over the real endpoints |

**Two porting traps**, both because the branch's merge-base is `80b427a`, not current `main`:

1. Its `pages/login.tsx` change and its new `utils/safeCallbackUrl.ts` are **superseded**. `main` already has `utils/loginAuth.ts` with a `safeCallbackUrl` doing the same job (plus `getLoginErrorMessage`), wired into the reworked login page from PR #208. **Drop both files** rather than reintroducing a duplicate helper.
2. Its `hooks/useRequireUser.ts` change — redirect to `/login?callbackUrl=<current path>` instead of bare `/login` — is **not** on `main` and **is** required. A Telegram link opened by a signed-out player must return to the vote page after sign-in, or the whole "share a URL in the group" premise fails on first use. Port that one.

One inherited product behaviour worth stating rather than leaving implied: **the roster stays hidden until you have voted** (`CheckInView`'s `showRoster`, documented in the branch's `components.md`). That is deliberate in the mockup, not an oversight — but see open question 3.

## Decision 1 — the URL is the readable game date

`/s/{slug}/game-day/2026-09-23`. The mockup's `wed-`/`fri-` prefix is dropped: a squad has exactly one playing day per week, so the weekday is redundant with the date and wrong to encode twice.

The alternative considered was an unguessable token (a `publicId` column, `/game-day/k7x2m9qp`). **Rejected**, but for a narrow reason worth recording: the token would buy nothing here, because the page is not public. It is gated by `resolveSquadUserOrRedirect` — signed in *and* a `Player` row in this squad — and every write re-resolves the caller's eligibility server-side. Guessing the URL therefore reveals nothing to anyone who could not already reach it from their own profile page. A token would only add a lookup, a column, and an unreadable Telegram post.

Note this is the *only* thing making the readable URL acceptable. **If the page is ever made link-public** (open question 3's stronger form, or a future "show the group who's in without signing in"), the date URL becomes a roster leak and the decision has to be revisited *before* that ships, not after.

There is no tokenised-link infrastructure anywhere in this app today — every surface is either fully public or Google-authenticated — so choosing the readable date also avoids being the first thing to introduce one.

## Decision 2 — the old Telegram poll stays, for now

`lib/telegram/sendEncounterPoll.ts`, `lib/telegram/scheduleConfig.ts`'s day-keyed `TELEGRAM_SCHEDULE`, and the 17:00 cron in `instrumentation.ts` are **untouched** by this work. The group will get both the old poll and the new vote link for a while.

Retiring it in the same change was the tidier option and was **rejected on sequencing, not on merit**: this plan replaces a mechanism the club actually relies on every session, and the new one has moving parts the old one does not (a cron that must fire on time, per-squad chat ids that must be configured correctly, a cut-over that must not mis-assign slots). Keeping the poll means a bad week costs a duplicate message rather than a lost session. Removing it is a small, clean follow-up once the vote has run for a few game days.

The duplication is genuinely temporary and genuinely small: two separate cron registrations, no shared state, no shared config. Nothing in this plan makes the removal harder.

## Decision 3 — the timezone lives in the `Squad.schedule` JSON

Add an IANA `timezone` field to `SquadScheduleData` (`lib/squadSchedule.ts`), validated in `validateScheduleInput` alongside the times it qualifies, defaulting to `Europe/Amsterdam` when absent.

Every clock in this feature (09:00, 10:00, 13:00, start − 2h) is a **wall-clock time in the squad's zone**, and `Squad.schedule` currently stores `startTime`/`endTime` as bare `"HH:mm"` strings with no zone at all. The only timezone in the repo is the `Europe/Amsterdam` hardcoded in `instrumentation.ts`'s cron registration — and the mockup hardcodes the same constant a second time.

It belongs in `schedule` rather than a new column because it qualifies fields that are already there: a start time without a zone is incomplete, and splitting the two apart invites them to disagree. `schedule` is already `Json?`, so this costs **no migration**, and `isRecurring: false` already clears the whole blob, so there is no stale-data path to design.

A dedicated `Squad.timezone` column was considered and rejected: nothing queries or filters by timezone, so a column buys only column count — the same argument that collapsed the original separate schedule columns into this blob in the first place.

## Decision 4 — cut-over freezes the list; Game Planner still creates the `Game`

At 13:00 the game day goes `CLOSED` and its attendance is frozen. Game Planner then opens with the confirmed players **pre-ticked**, showing a banner for anyone who dropped out after cut-over and any assigned open-slot player still awaiting confirmation. The admin presses Create Game Day exactly as today.

Auto-creating the `Game` row at cut-over was considered and **rejected**. `calculateGroupDistribution` requires 4–20 players forming groups of 4–5, and `POST /games` rejects any group containing a scoreless player (`findScorelessPlayersInGroups`). Both are conditions the vote can legitimately produce — a thin night, or an open-slot player who has never been given a starting score — and both would fail at 13:00 with no admin present to see the error and nowhere sensible to report it. Pre-selection captures nearly all the value and cannot fail.

This also keeps the change out of the ranking path entirely: selection, group distribution, the rank-order slicing and the scoreless gate are all untouched.

## Decision 5 — a slot votes, and whoever holds it that day casts the vote

Eligibility is a property of **the slot**, resolved for the game date:

| Player, on the game date | May vote? |
|---|---|
| `FULLTIME`, slot not covered | **yes** |
| `FULLTIME`, slot covered by an active `SlotReplacement` | no — they gave it away |
| `OPEN_SLOT`, covering an active `SlotReplacement` | **yes** — they hold the slot |
| `OPEN_SLOT`, not covering one | no — the waiting list is their route in |
| `OPEN_SLOT`, **assigned an open slot on this game day** | **yes** — see Decision 6 |

"Active" is `startDate <= gameDate <= endDate AND cancelledAt IS NULL`, matching the derived-not-stored convention `OPEN_SLOT_PLAYERS_PLAN.md` established. All rows exclude `playerStatus === 'DISABLED'`, matching `getAvailablePlayersForGame`.

**The date matters, and this is the easiest thing in the plan to get wrong.** A vote opens two days ahead, so eligibility must be resolved against `gameDate`, **not today**. Neither existing helper can be reused as-is: `getAvailablePlayersForGame` (`lib/ranking/players.ts:415`) hardcodes today, and `filterBoardVisible` takes an `asOf` but answers a different question. A replacement window that starts tomorrow makes the owner ineligible for a vote that opened yesterday — and reusing a today-based helper would silently get that backwards. It earns its own regression test.

Double-voting for one covered slot (owner *and* replacement) was considered, on the grounds that it would mirror the absentee sweep, where a covered owner still accrues demerits ("Double liability for one slot" in `OPEN_SLOT_PLAYERS_PLAN.md`). **Rejected.** That rule is about a penalty and is explicitly recorded there as deferred-not-settled; attendance is about a physical court slot, and one slot can seat one person. Two votes for it would corrupt every count in this document.

## Decision 6 — being assigned an open slot is not the same as confirming

An open-slot player who is assigned a slot **becomes a voter for that game day and is expected to vote**, like everyone else holding a slot. The assignment gives them the slot; it does not speak for them.

That means two distinct quantities, which an earlier draft of this plan collapsed into one and double-counted. They are separated here because every piece of arithmetic downstream depends on which one is meant:

**`slotsHeld`** — how many of the session's slots are *taken*. This governs how many more people may be let in.

```
slotsHeld = count(votes IN cast by structural slot holders)
          + count(GameDayOpenSlot where status = ASSIGNED)
```

The two terms are **disjoint by construction** — a player is either a structural holder (Decision 5's first table) or in the open-slot pool, never both — which is what makes this a clean sum rather than a set union. **An assigned player who has not voted yet still holds their slot**: it is reserved for them and must not be offered to the next person on the waiting list. This is also what stops cut-over from looping — promoting *n* players raises `slotsHeld` by *n* immediately, so the shortfall reaches zero on the same pass.

**`confirmedIn`** — how many people have actually said they are coming.

```
confirmedIn = count(votes IN)     // structural holders and assigned open-slot players alike
```

This is what the 09:00 minimum check compares, what the roster displays, and what Game Planner pre-ticks. An assigned player who has not voted appears as **awaiting confirmation** — visible to everyone on the page and to the admin in the planner banner — and is deliberately *not* counted as attendance.

A consequence worth stating: `slotsHeld >= confirmedIn` always, and the difference is exactly the set of unconfirmed assignees. A session can therefore be "full" (no vacancies to offer) while still short of confirmed players. That is the correct behaviour — those slots are spoken for — and the gap closes itself as people confirm, or reopens via `syncOpenSlotVacancies` when they vote out.

**Voting OUT and giving up an assigned slot are one action**, not two. `castVote(OUT)` writes the vote row and flips the `GameDayOpenSlot` to `WITHDRAWN` in the same transaction. Two separate operations would let the vote and the slot disagree — an "out" player still occupying a slot, or a withdrawn player still counted in — and there is no reading of the domain where those states mean anything.

## Decision 7 — open-slot opt-out is asymmetric, deliberately

| How they got the slot | May they give it up? |
|---|---|
| **Auto-assigned from the waiting list** at or after cut-over | yes, until `slotLockAt` (session start − 2h) |
| **Claimed directly** from the post-cut-over "slots available" link | no — it is theirs |

The asymmetry looks like an inconsistency and is not. A waiting-list player asked to be *considered*; the system then handed them a slot, possibly hours later, possibly for an evening they can no longer make. A direct claimer looked at "3 slots open" and took one, at that moment, deliberately. The first is an offer that can be declined; the second is an acceptance.

It also has the right incentive shape: giving up a waiting-list assignment early reopens the slot with enough runway (2h) for the group to fill it, which is the whole reason for the deadline. After `slotLockAt` nobody can realistically be found, so the slot stops being transferable for everyone.

A direct claimer's page therefore shows **"I'm in" only** — their vote is a confirmation, never a withdrawal.

## Decision 8 — the waiting list is this squad's open-slot roster

Eligible to join: `OPEN_SLOT` players on this squad's roster, not covering an active replacement on that date, not `DISABLED`. This is exactly the complement of Decision 5's voter pool within the open-slot population, so the two pools are disjoint and one page can serve both roles without a mode switch.

Two alternatives were considered:

- **Letting a structural holder who voted OUT join the waiting list**, in case they free up. Not proposed — it makes the pools overlap and `slotsHeld`'s two terms non-disjoint, for a case ("I'm out, but maybe") the vote can already express by simply not voting out. Raised as open question 2 rather than decided, since it is a one-line relaxation of `getOpenSlotPool` if wanted.
- **Opening it to people who are not on the roster at all.** That requires `SELF_REGISTRATION_PLAN.md`'s join-request flow to exist first (there must be a `Player` row to attach an entry to). Deliberately excluded so the two plans stay independent.

**The waiting list is open from creation**, two days ahead — it does not wait for the 09:00 Telegram ping. The ping is an announcement, not a gate; an open-slot player who checks their profile page on Monday can put their name down for Wednesday without anyone messaging them.

**Scoreless players are welcome.** An `OPEN_SLOT` player may have `rankScore === null`, and nothing in this feature touches the Elo or absentee math. The existing guards still hold the real boundary: `POST /games` rejects a group containing a scoreless player, and the planner's `BulkScorePanel` is the friendly path to fixing it. A voted-in scoreless player shows up in the planner with the existing "needs a score" marker rather than being blocked from voting for a session they are going to attend anyway.

## Decision 9 — new squad settings go in one `Squad.gameDayOps` JSON column

Four settings (`voteOpensDaysBefore`, `minPlayersForOpenSlot`, and the two Telegram chat ids) collapse into a single `Json?` column rather than four typed columns.

This follows `Squad.schedule` exactly, and for the same stated reason: **nothing ever queries or filters by an individual piece.** No code will ever ask "which squads open their vote 3 days ahead" or "which squads use chat id X". Separate columns would buy only column count — and would need a migration each time a fifth setting appears, where this needs none.

The trade accepted alongside `schedule` applies here too: a JSON blob is not type-checked by the database, so validation has to live in code. `lib/gameDayOps.ts`'s `validateGameDayOpsInput` is that code, mirroring `validateScheduleInput` down to the shape of its return type, and it is the only writer.

`null` means check-in was never configured for this squad: no game day instances are created, and nothing is ever sent. **Deliberately default-off** — and deliberately the opposite default-shape from `openSlotAbsenteeGraceDays`, whose plan argued at length that a null-means-disabled default was the *worst* outcome. The difference is what the setting does. That one protects a player from a penalty, so silence hurt them. This one **posts messages to Telegram groups**, so silence until an admin opts in is the safe state, and an existing squad cannot start messaging its group because a deploy landed.

---

## Data model (`frontend/prisma/schema.prisma`)

Three new models, four new enums, one new `Squad` column, one nullable FK on `Game`. **No change to `Player` except the two relation back-references Prisma requires**, and none at all to `Encounter` or `ScoreHistory`.

```prisma
enum GameDayStatus { OPEN CLOSED CANCELLED }
enum VoteChoice { IN OUT }
enum OpenSlotEntryStatus { WAITING ASSIGNED WITHDRAWN }
enum OpenSlotClaimSource { WAITING_LIST DIRECT }
```

Real Prisma enums, not free-string columns: these are all new fields with no legacy values to tolerate, so the reasoning that kept `Player.playerStatus` a `String?` does not apply — the same call `playerType` made.

### `GameDay`

```prisma
model GameDay {
  id       Int      @id @default(autoincrement())
  squadId  Int      @map("squad_id")
  gameDate DateTime @map("game_date") @db.Date

  // Snapshot of the squad's schedule + gameDayOps AT CREATION, never re-read. An admin editing
  // the schedule, its timezone, or the minimum two days before a session must not silently move
  // an announced session's clock, or change the gap arithmetic under a vote people already cast.
  startTime  String        @map("start_time") @db.VarChar(5)
  endTime    String        @map("end_time")   @db.VarChar(5)
  timezone   String        @db.VarChar(64)
  minPlayers Int?          @map("min_players")   // null = no open-slot flow on this squad
  status     GameDayStatus @default(OPEN)

  // Absolute instants, resolved from the snapshot above at creation. Stored rather than
  // recomputed so the scheduler compares two instants and never re-derives a wall clock.
  votesCloseAt DateTime @map("votes_close_at")
  slotLockAt   DateTime @map("slot_lock_at")     // session start - 2h

  // One nullable timestamp per one-shot message. The scheduler's guard is
  // "threshold passed AND stamp is null", never "now == threshold" - see "Scheduler".
  announcedAt      DateTime? @map("announced_at")
  remindedAt       DateTime? @map("reminded_at")
  openSlotPingedAt DateTime? @map("open_slot_pinged_at")
  closedAt         DateTime? @map("closed_at")

  // Last vacancy count posted to the open-slot group. Makes vacancy announcements idempotent and
  // stops a re-post when nothing actually changed - see syncOpenSlotVacancies.
  announcedVacancies Int? @map("announced_vacancies")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  squad     Squad             @relation(fields: [squadId], references: [id])
  votes     GameDayVote[]
  openSlots GameDayOpenSlot[]
  game      Game?

  @@unique([squadId, gameDate])
  @@index([squadId, gameDate])
  @@map("GAME_DAY")
}
```

The snapshot columns are the part most likely to be questioned as redundant, so to be explicit: they exist because **a game day is a published promise**. Once "vote by 13:00 Wednesday" has gone to a Telegram group, an admin fixing an unrelated typo in the schedule must not retroactively move that deadline, and an admin raising the minimum from 16 to 18 must not silently reopen slots on a session that already cut over.

### `GameDayVote` and `GameDayOpenSlot`

```prisma
model GameDayVote {
  id        Int        @id @default(autoincrement())
  gameDayId Int        @map("game_day_id")
  playerId  Int        @map("player_id")
  choice    VoteChoice
  votedAt   DateTime   @default(now()) @map("voted_at")
  updatedAt DateTime   @updatedAt      @map("updated_at")

  gameDay GameDay @relation(fields: [gameDayId], references: [id])
  player  Player  @relation(fields: [playerId], references: [id])

  @@unique([gameDayId, playerId])
  @@index([gameDayId, choice])
  @@map("GAME_DAY_VOTE")
}

// How an open-slot player came to hold a slot on this game day. Their in/out answer lives in
// GameDayVote like everyone else's - this row is the slot, not the attendance (Decision 6).
model GameDayOpenSlot {
  id        Int                  @id @default(autoincrement())
  gameDayId Int                  @map("game_day_id")
  playerId  Int                  @map("player_id")
  status    OpenSlotEntryStatus  @default(WAITING)
  source    OpenSlotClaimSource?                   // set when ASSIGNED

  joinedAt    DateTime  @default(now()) @map("joined_at")   // waiting-list order
  assignedAt  DateTime? @map("assigned_at")
  withdrawnAt DateTime? @map("withdrawn_at")

  gameDay GameDay @relation(fields: [gameDayId], references: [id])
  player  Player  @relation(fields: [playerId], references: [id])

  @@unique([gameDayId, playerId])
  @@index([gameDayId, status])
  @@map("GAME_DAY_OPEN_SLOT")
}
```

Real FK relations to `Player` are fine here, exactly as `SlotReplacement` established: this is new code with no legacy anti-pattern to preserve (unlike `ScoreHistory.playerId`), and player deletion is not implemented. Prisma requires both sides, so `Player` gains `gameDayVotes GameDayVote[]` and `gameDayOpenSlots GameDayOpenSlot[]`, and `Squad` gains `gameDays GameDay[]`.

`joinedAt` is the waiting list's ordering key and the only fairness guarantee in the feature — promotion is strictly first-come.

### `Squad.gameDayOps`

```prisma
// Game-day check-in operations config (ATTENDANCE_VOTE_PLAN.md). A single JSON blob, exactly like
// `schedule` above and for the same reason: nothing ever queries or filters by an individual
// piece (days-ahead, the minimum, a chat id), so separate columns bought nothing but column
// count. Shape: GameDayOpsData in lib/gameDayOps.ts.
//
// Null = check-in never configured for this squad: no game day instances are created and nothing
// is ever sent. Deliberately default-off, and deliberately the opposite default-shape from
// openSlotAbsenteeGraceDays - that setting protects a player from a penalty, so a disabled
// default was the worst outcome; this one POSTS TO TELEGRAM GROUPS, so silence until an admin
// opts in is the safe state.
gameDayOps Json? @map("game_day_ops")
```

```ts
// lib/gameDayOps.ts - validation lives here so the API route and tests share it, mirroring
// lib/squadSchedule.ts's validateScheduleInput, including the returns-data-or-error shape.
export interface GameDayOpsData {
  enabled: boolean;                      // false clears the rest, like schedule.isRecurring
  voteOpensDaysBefore: number;           // default 2, range 1..14
  minPlayersForOpenSlot: number | null;  // null = no open-slot flow on this squad
  telegramMainChatId: string | null;
  telegramOpenSlotChatId: string | null;
}

export function validateGameDayOpsInput(
  input: GameDayOpsInput
): { data: GameDayOpsData } | { error: string }
```

The bot token stays in `TELEGRAM_BOT_TOKEN` (env, one shared bot — already true today, and confirmed during the Java migration as one real bot rather than two). Only chat ids become per-squad. Absolute links use the existing **`NEXT_PUBLIC_APP_URL`** — no new env var.

`voteOpensDaysBefore` is bounded at 14 for the same reason `MAX_REPLACEMENT_MONTHS` exists: the scheduler walks dates a day at a time, and an unbounded value is a pointless loop on a single-threaded server.

### `Game` — one nullable link

```prisma
gameDayId Int?     @unique @map("game_day_id")
gameDay   GameDay? @relation(fields: [gameDayId], references: [id])
```

Stamped when the planner creates a `Game` from a closed game day, so the throwaway session state can be traced back to the attendance that produced it.

**`Game.createdAt` remains the encounter date** for `submit.ts` and `process.ts`. Retargeting them at `gameDay.gameDate` would be more correct in principle — `Game` has no date column today, which is precisely why a vote two days out could not attach to one — but it changes a shipped ranking path for no practical gain, since the planner is run on the day and the two agree. Out of scope, recorded so it is not "fixed" later without thinking about the ranking consequences.

### Migration

One additive migration, `frontend/prisma/migrations/<YYYYMMDDHHMMSS>_game_day_attendance/migration.sql`: three `CREATE TABLE`s, `ALTER TABLE Squad ADD COLUMN game_day_ops JSON NULL`, and `ALTER TABLE Game ADD COLUMN game_day_id INT NULL` with its unique index and foreign key. No backfill, no nullable-then-tighten staging, nothing that can fail on populated tables.

Per `CLAUDE.md`: generate with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (with a `--shadow-database-url`), check it in, apply with `node scripts/prisma-migrate-deploy.mjs`, and confirm zero drift with `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code`.

The `timezone` schedule field (Decision 3) needs **no** migration — `Squad.schedule` is already `Json?`.

## The clock: `lib/gameDay/clock.ts` (new)

Every threshold in this feature is a wall-clock time in the squad's zone that must become an absolute instant. `date-fns` v3 is a dependency but **`date-fns-tz` is not**, and this repo's precedent is to hand-roll rather than add a dependency for one job — `sendEncounterPoll.ts` uses plain `fetch` instead of a Telegram client library, with that reasoning written into its file comment.

The mockup already hand-rolls the read direction, in `lib/check-in/schedule.ts`'s `getAmsterdamWallClock`: `Intl.DateTimeFormat(locale, { timeZone, ... })` plus `formatToParts`. Generalise it and add the inverse:

- **`wallClockIn(instant, timezone)`** → `{ year, month, day, hour, minute, jsDay }`. The mockup's function with the zone as a parameter.
- **`instantAt(dateIso, 'HH:mm', timezone)`** → `Date`. Guess the instant as if UTC, measure the zone's actual offset at that guess with `wallClockIn`, correct by the difference, measure once more. Two passes settle every case, including both DST transitions.
- **`addMinutes(instant, n)`** for `slotLockAt = instantAt(date, startTime, tz) − 120`.

Pure — no Prisma, no env, no `Date.now()` — so it is fully unit-testable, and it is the only place in the codebase doing timezone arithmetic.

`lib/gameDay/voteWindow.ts` holds the fixed clock constants:

```ts
export const OPEN_SLOT_PING_TIME = '09:00';
export const REMINDER_TIME       = '10:00';
export const VOTES_CLOSE_TIME    = '13:00';
export const SLOT_LOCK_MINUTES_BEFORE_START = 120;
```

Constants rather than settings, deliberately: `gameDayOps` already carries four fields, and these four are club convention rather than per-squad policy. Promoting them into `gameDayOps` later is purely additive — see open question 1.

## Eligibility: `lib/gameDay/eligibility.ts` (new)

```ts
// Structural: derived from playerType + SlotReplacement, independent of votes and assignments.
export async function getStructuralSlotHolders(squadId: number, gameDate: Date): Promise<Player[]>
export async function getOpenSlotPool(squadId: number, gameDate: Date): Promise<Player[]>
// Who may cast a vote on THIS game day: structural holders + anyone with an ASSIGNED open slot.
export async function getGameDayVoters(gameDay: GameDay): Promise<Player[]>
```

- **Structural holders** = `FULLTIME` ∖ `{replacement owners}` ∪ `OPEN_SLOT` ∩ `{replacement fillers}`
- **Open-slot pool** = `OPEN_SLOT` ∖ `{replacement fillers}`
- **Voters** = structural holders ∪ `{players with an ASSIGNED GameDayOpenSlot on this game day}`
- All exclude `playerStatus === 'DISABLED'`

The first two are disjoint by construction — that is what makes `slotsHeld` a sum rather than a union, and what lets one page serve both roles without a mode switch. All three resolve replacements **against `gameDate`** (Decision 5).

## Vote rules: `lib/gameDay/votes.ts` (new)

`castVote(squadId, gameDayId, playerId, choice)`, throwing `ValidationError` (`lib/api/validationError.ts`) for caller error so routes answer 400 with a reason rather than a blanket 500 — the pattern `lib/replacements.ts` and `players/bulk-initial-score.ts` already use.

| Voter | Game day `OPEN` | Game day `CLOSED` |
|---|---|---|
| Structural slot holder | IN and OUT freely, any number of times | **IN rejected** — "voting has closed"; OUT allowed **only from a current IN** |
| Assigned open slot, `source: WAITING_LIST` | n/a — assignment only happens at or after cut-over | IN allowed (their confirmation); OUT allowed until `slotLockAt`, and releases the slot |
| Assigned open slot, `source: DIRECT` | n/a | IN allowed; **OUT always rejected** — "this slot is yours" |
| Anyone else | rejected — not a voter | rejected |

`CANCELLED` rejects everything.

Reaching `CLOSED` with no vote row at all means you are already out, so an attempt to go OUT is rejected with the same message as IN rather than writing a row that means nothing.

The asymmetry in the first row is the rule as stated: after the cut-over you can still drop out (people's evenings change), but you cannot opt back in, because the open slots created by your absence may already have been given away.

Every transition that can widen the gap — a holder's post-close IN → OUT, an assignee's OUT — is followed by `syncOpenSlotVacancies`.

## Open slots: `lib/gameDay/openSlots.ts` (new)

**`syncOpenSlotVacancies(gameDayId)` is the core of the feature.** Three of the stated requirements turn out to be the same event observed at three different moments, so they are one function:

```
if status != CLOSED, or minPlayers is null, or no open-slot chat id -> no-op

slotsHeld = count(votes IN by structural holders)
          + count(openSlots where status = ASSIGNED)   // disjoint; unvoted assignees still hold
vacancies = max(0, minPlayers - slotsHeld)

if vacancies == announcedVacancies -> no-op            // nothing changed; do not re-post

promoted = take(vacancies) from openSlots where status = WAITING, ordered by joinedAt
  -> ASSIGNED, source = WAITING_LIST, assignedAt = now
vacancies -= promoted.length                           // reaches 0 on this pass; cannot loop

post to the open-slot group:
  promoted > 0 && vacancies > 0  -> "<names> are in. <n> spots still open: <url>"
  promoted > 0 && vacancies == 0 -> "<names> are in. The session is full."
  promoted == 0 && vacancies > 0 -> "<n> open slots for <date>. First come, first served: <url>"

announcedVacancies = vacancies
```

Three call sites:

1. **At cut-over (13:00).** First call, `announcedVacancies` is null, so it always posts. This covers both stated branches at once — waiting list present → names plus any remainder; waiting list empty → vacancy count and link.
2. **After a structural holder's post-close IN → OUT.** The gap grew.
3. **After a waiting-list assignee votes OUT before `slotLockAt`.** The gap grew, and the next person on the list is promoted on the same pass.

The `announcedVacancies` comparison is what keeps a burst of changes from becoming a burst of Telegram posts, and it is what makes the function safe to call unconditionally after any state change — the caller never has to work out whether an announcement is warranted.

**Joining and claiming** — `joinOpenSlot(squadId, gameDayId, playerId)`, in one `prisma.$transaction`. MySQL cannot express these rules as constraints, so check-then-insert inside a transaction is the mechanism, following the precedent `SlotReplacement`'s overlap check set and `SELF_REGISTRATION_PLAN.md` reaffirmed:

- The player must be in `getOpenSlotPool` for this date.
- `status === OPEN` → insert `WAITING`. The 09:00 ping is not a precondition (Decision 8).
- `status === CLOSED` → recompute `vacancies` **inside the transaction**; `> 0` → insert straight to `ASSIGNED, source: DIRECT`; `== 0` → `ValidationError`, "no open slots available". Two people racing for the last slot is exactly what the transaction is for, and the loser gets a clean 400 rather than a phantom slot.

**Leaving** — `leaveOpenSlot(squadId, gameDayId, playerId)` handles only the `WAITING` case: delete the row, since it is just a queue. Giving up an **assigned** slot goes through `castVote(OUT)` (Decision 6), so there is exactly one code path that can release a slot.

## Scheduler: `lib/gameDay/scheduler.ts` (new), registered in `instrumentation.ts`

A second `cron.schedule` alongside the existing 17:00 poll, **inside the same `process.env.NEXT_RUNTIME === 'nodejs'` block**. That exact `===` form is load-bearing: `src/middleware.ts` forces Next to compile `instrumentation.ts` for the edge runtime too, and only this form is what the build-time substitution and dead-code elimination recognise to drop the branch and its dynamic `node-cron` import from the edge bundle. An inverted early-return guard was tried once and broke the production build. The new registration goes *inside* that block, never beside it, with its own `global.__…Registered` flag.

**Cadence: every 5 minutes** (`*/5 * * * *`), not a fixed daily time. The thresholds are wall-clock times in each squad's own zone, so no single UTC cron can hit 09:00, 10:00 and 13:00 for every squad — and a fixed-time cron would drift by an hour twice a year with DST, silently, in whichever direction hurts most.

Each tick, for every `enabled` squad with a recurring schedule and `gameDayOps.enabled`:

1. **Create** — if the date `voteOpensDaysBefore` days ahead is a playing day (`lib/scheduling/playingDayCalculator.ts`'s `isPlayingDay`, reused as-is), upsert a `GameDay` on `@@unique([squadId, gameDate])`, snapshotting times, timezone and the minimum, and resolving `votesCloseAt` / `slotLockAt` through the clock module.
2. **Cancel** — an `OPEN` game day whose date is no longer a playing day (an admin added a `skipDate`, or ended the recurrence) → `CANCELLED`, and nothing further is sent for it. See open question 4.
3. **Announce** — `announcedAt` null → post to the main group; stamp.
4. **Open-slot ping** — past 09:00 local on the game date and `openSlotPingedAt` null → send **only if** the minimum and the open-slot chat id are both configured **and `confirmedIn` is below the minimum**. Stamp the column **either way**, logging the skip reason, so a decided-not-to-send does not retry five minutes later.
5. **Remind** — past 10:00 local and `remindedAt` null → post to the main group with current counts.
6. **Cut over** — past `votesCloseAt` and `status === OPEN` → `CLOSED` + `closedAt`, then `syncOpenSlotVacancies`.

**Every guard is "threshold passed AND stamp is null", never "now equals threshold".** A container restart at 13:04, a slow tick, a paused deploy or a DST jump must be caught up on the next tick rather than silently skipping a session's announcement — which, with a 5-minute cadence and a once-a-week event, would otherwise be invisible until someone noticed nobody had voted.

Each squad's tick is wrapped in its own try/catch, so one squad's failure — a revoked chat id, a Telegram outage, a malformed `gameDayOps` blob — cannot abort the sweep for the others.

## Telegram: `lib/telegram/sendMessage.ts` + `lib/gameDay/notifications.ts` (new)

`pages/api/notify.ts` already does everything needed — a plain-`fetch` `sendMessage` with HTML parse mode and `reply_markup.inline_keyboard` URL buttons — but with `process.env.TELEGRAM_CHAT_ID!` hardcoded inline, so it cannot be reused. **Extract** `sendTelegramMessage(botToken, chatId, text, buttons?)` into `lib/telegram/sendMessage.ts` and refactor `notify.ts` onto it with no behaviour change. Every new message takes its chat id as an argument, from `gameDayOps`, so nothing new reads env for a destination.

`lib/gameDay/notifications.ts` builds the bodies and owns the absolute URL (`${NEXT_PUBLIC_APP_URL}/s/${slug}/game-day/${gameDate}`), with an inline-keyboard button beside the plain link so the post works in both Telegram clients. Four pure builders, separate from the sending so they can be asserted on without mocking `fetch`:

| Message | Group | Trigger |
|---|---|---|
| Vote is open | main | on creation, `voteOpensDaysBefore` ahead |
| Reminder, with current counts | main | 10:00 game day |
| Players needed — join the waiting list | open-slot | 09:00 game day, `confirmedIn` < minimum |
| Slots assigned / slots available | open-slot | `syncOpenSlotVacancies` |

## API routes

All under `frontend/src/pages/api/squads/[squadId]/game-days/`, following the house shape: `parseSquadId` → auth guard → manual method dispatch → `405` fallthrough → `isValidationError ? 400 : 500`.

| Route | Method | Gate |
|---|---|---|
| `index.ts` | GET — upcoming game days, with the caller's vote/slot state per day | squad member |
| `[date]/index.ts` | GET — one game day: snapshot, status, countdown, my role, my vote, IN/OUT rosters, assigned open slots, awaiting-confirmation list, `confirmedIn`, `slotsHeld`, vacancies | squad member |
| `[date]/vote.ts` | PUT — `{ choice: 'IN' \| 'OUT' }` | squad member, must be a voter for that date |
| `[date]/open-slot.ts` | POST — join the waiting list / claim a slot | squad member, must be in the open-slot pool |
| " | DELETE — leave the **waiting list** (giving up an assigned slot is `PUT vote { OUT }`) | same |
| `[date]/admin.ts` | GET — full attendance for the planner; PATCH — admin close/cancel override | `requireSquadAdmin` |
| `../schedule.ts` | PATCH — gains `timezone` | existing route, `requireSquadAdmin` |
| `../game-day-ops.ts` | PATCH — the `gameDayOps` blob via `validateGameDayOpsInput` | `requireSquadAdmin` |

`GET /api/squads/[squadId]` gains the unpacked `gameDayOps` fields on the wire, exactly as it already unpacks `schedule` into flat `scheduleXxx` names, so `useSquadSettings()` keeps its flat shape and the settings page needs no new hook.

**`[date]` is `YYYY-MM-DD`.** Reject anything else with a 400 before touching the database, then resolve by `@@unique([squadId, gameDate])`. A valid date with no row is a 404 — which is also what a guessed URL for a non-playing day gets.

### One refactor this work should carry: `requireSquadMember`

There is **no member-level auth helper today.** `replacements/index.ts`, `replacements/preview.ts`, `players/open-slot.ts`, `games/my-matches.ts` and `user/scores.ts` each inline the same three steps: `getServerSession`, `getSquadAccess(email, squadId)`, and an `isSuperAdmin` bypass. This plan adds five more routes needing exactly that, which is the point at which copying it a tenth time stops being defensible.

Extract `requireSquadMember(req, res, squadId)` into `lib/auth.ts` beside `requireSquadAdmin` / `requireSuperAdmin`, returning `Session | null` and writing its own 401/403 like they do, and move the existing call sites onto it in the same PR. It is a small change, but it is the difference between one place that decides what "a member of this squad" means and ten.

### The identity rule, unchanged

`SELF_REGISTRATION_PLAN.md`'s one security property applies here verbatim: **the acting player is resolved from `getSquadAccess(session.user.email, squadId)`, never from a request body.** A vote body carries `choice` and nothing else; an open-slot POST carries nothing at all. This is the one thing in the plan that is a security property rather than a correctness one, so it gets a route-level test per write path, not just a review note.

## UI

**`pages/s/[squad]/game-day/[date].tsx`** — the mockup page, renamed from `[uid]`, still gated by `resolveSquadUserOrRedirect`. Everyone in the squad passes that gate; the page branches on the role the API returns:

- **voter** (structural holder, or an assigned open-slot player) — `CheckInVoteButtons` exactly as the mockup draws them. Past close, "I'm in" is disabled with a "voting has closed" note while "I'm out" stays live for anyone currently IN. A `DIRECT` claimer sees "I'm in" only, with a line saying the slot is theirs (Decision 7).
- **open-slot, not yet assigned** — the vote buttons are replaced by *Join waiting list* / *Leave waiting list* before cut-over, and *Claim a slot* after, reusing `CheckInVoteButtons`' two-button geometry and token styling so the page still reads as one design.
- **observer** (a covered fulltime owner, or a platform superadmin with no `Player` row — a case `resolveSquadUserOrRedirect` explicitly admits) — roster and status only, with one line saying why they cannot act.

`CheckInRoster` gains a third group for **assigned open slots**, with an *awaiting confirmation* marker on assignees who have not voted — the visible consequence of Decision 6. `CheckInPlayerRow` is unchanged: `colorHex` disc, name, rank, **You** chip.

**`UpcomingSessionsList`** on the profile page swaps its two hardcoded weekday slots and its `localStorage` vote chip for the `GET /game-days` response. `UserTabBar`'s Check-in tab links at the nearest upcoming game day from the same data.

**`hooks/useGameDayCheckIn.ts`** becomes SWR over the two GET endpoints, with optimistic vote mutation and `mutate()` revalidation — the shape `user/replacement.tsx` already uses.

**Squad settings** (`pages/s/[squad]/admin/settings.tsx`) gains a **"Game day check-in"** card in the existing hand-rolled token style (`cardClass` / `inputFieldClass` / `primaryBtn`, as the "Open-slot players" card does) with an enable toggle and the four `gameDayOps` fields, plus a **timezone** select on the existing Play-schedule card.

**Game Planner** (`pages/s/[squad]/admin/game-planner.tsx`) reads the closed game day for today and pre-ticks **`confirmedIn` players only**, with a banner listing anyone who went OUT after cut-over and any assigned open-slot player still awaiting confirmation — so the admin decides about the unconfirmed rather than finding them silently ticked. `calculateGroupDistribution`, the rank-order slicing, the scoreless gate and the two-pool picker are all **unchanged**; this only seeds the initial selection. On create, stamp `Game.gameDayId`.

DaisyUI stays out of the player-facing pages — they follow `docs/design.md` tokens like the rest of the mockup. Any admin oversight table added here follows `ReplacementOversight.tsx` instead. The codebase is deliberately inconsistent between these two idioms along the admin/player line, and this change keeps to that line rather than blurring it.

## Testing / verification (for the implementation PR)

**Unit tests**, using the `vi.mock('@/lib/prisma', …)` pattern from `lib/replacements.test.ts` and `lib/ranking/absenteeSpell.test.ts`:

- **`clock.test.ts`** — `instantAt` round-trips against `wallClockIn` across a DST spring-forward and a fall-back in `Europe/Amsterdam`, and in a second zone with a different offset; 09:00/10:00/13:00 land on the right instants either side of each transition.
- **`eligibility.test.ts`** — a covered fulltime owner is excluded and their filler included **for the game date, not today** (a window active on the game date but not today, *and* the reverse — this is the regression test for reusing a today-based helper); a cancelled window excludes nobody; a `DISABLED` player is in no pool; structural holders and the open-slot pool never intersect; an assigned open-slot player is returned by `getGameDayVoters` but not by `getStructuralSlotHolders`.
- **`counts.test.ts`** — the two numbers. An assigned player who has not voted counts in `slotsHeld` but not `confirmedIn`; one who votes IN counts in both and is **not double-counted**; one who votes OUT counts in neither.
- **`votes.test.ts`** — free switching while OPEN; IN rejected after close for a structural holder; OUT after close accepted only from a current IN; no-vote OUT after close rejected; a vote from a non-voter rejected; an assigned `WAITING_LIST` player's OUT succeeds before `slotLockAt`, fails after, and flips the entry to `WITHDRAWN` in the same transaction; a `DIRECT` claimer's OUT always fails; `CANCELLED` rejects everything.
- **`openSlots.test.ts`** — promotion is strictly `joinedAt` order; **cut-over promotes exactly `vacancies` players and does not loop** (the regression test for the double-count Decision 6 fixes); a direct claim past cut-over succeeds while vacancies remain and 400s at zero; two concurrent claims for one slot leave exactly one winner.
- **`syncOpenSlotVacancies.test.ts`** — posts at cut-over with and without a waiting list; **does not** post when the vacancy count is unchanged (the anti-spam property); posts again when a post-close OUT widens the gap; no-ops entirely when the minimum or the chat id is unset.
- **`scheduler.test.ts`** — against a pure `decideGameDayActions(gameDay, now)` returning the due actions, so the threshold logic is testable without cron, env or `fetch`: a tick at 13:04 still cuts over; an already-stamped action is not repeated; a skip-dated day is cancelled rather than announced.
- **`gameDayOps.test.ts`** — mirrors `squadSchedule.test.ts`: `enabled: false` clears the rest; an out-of-range `voteOpensDaysBefore` is rejected; a chat id set without the feature it belongs to is rejected with a clear message.
- **`notifications.test.ts`** — the four message bodies and the absolute URL.
- **Route-level tests** that each write path ignores any identity in the body and uses the session's — the security property from "The identity rule".
- `playingDayCalculator.test.ts` and `characterization.test.ts` must pass **unmodified**. Note `characterization.test.ts` is *not* a safety net here: it exercises only the pure `calculateElo` / `decideAbsenteeAction` / `computeActivationScore` functions, and nothing in this plan touches the ranking math, so it would pass regardless.

**Migration:** apply with `node scripts/prisma-migrate-deploy.mjs` against the local compose DB, then confirm the `migrate diff --exit-code` drift check exits 0.

**End-to-end, in a browser against `npm run dev`.** Add a superadmin "run scheduler tick now" action, mirroring the existing Telegram-test buttons on the admin dashboard, so a full cycle does not take two real days:

1. A squad with no recurring schedule, or with `gameDayOps` unset, creates no game day and logs a skip — existing squads are unaffected until an admin opts in.
2. Configure schedule + timezone + `gameDayOps`; tick → a `GameDay` appears for the date `voteOpensDaysBefore` ahead, and the main group gets the vote-is-open post with a working link.
3. Open that link **signed out** → `/login?callbackUrl=…` → after sign-in you land back on the vote page. This is the `useRequireUser` port, and the whole share-a-link premise depends on it.
4. Vote IN, then OUT, then IN again while open. Confirm the roster stays hidden until the first vote.
5. As a fulltime player **with an active replacement covering that date**, confirm the page is read-only with a reason — and that their replacement can vote.
6. As an `OPEN_SLOT` player, join the waiting list **before** any 09:00 ping: the planned game day is visible and joinable from creation.
7. Tick past 09:00 with `confirmedIn` below the minimum → the open-slot group is pinged. Re-tick → **not** pinged again. Separately, with `confirmedIn` already at or above the minimum → no ping, stamp still set.
8. Tick past 13:00 → `CLOSED`; waiting-list players promoted in join order up to the gap and **no further**; the open-slot group gets names plus any remaining count. With an empty waiting list, it gets the vacancy count and link instead.
9. An assigned player who has **not** voted shows as *awaiting confirmation*, is **not** in `confirmedIn`, and their slot is **not** re-offered. They then vote IN → they move into `confirmedIn` and no total jumps (the no-double-count check).
10. Post-close: a structural holder votes OUT → a new vacancy post, and the next waiting-list player is promoted on the same pass. An OUT player tries IN → 400.
11. A waiting-list assignee votes OUT before start − 2h → slot released and re-offered; the same attempt after that instant → 400. A direct claimer's OUT → 400 at any time.
12. Two browsers claim the last remaining slot at once → one succeeds, one gets a clean 400 and no phantom row.
13. Open Game Planner on the day → `confirmedIn` players pre-ticked; the banner lists post-cut-over dropouts and unconfirmed assignees; Create Game Day works and stamps `Game.gameDayId`. Include a **scoreless** open-slot holder and confirm the existing `BulkScorePanel` gate still blocks — this is the important one: it proves the new entry path cannot leak a scoreless player into the Elo math.
14. **Boundary check:** a signed-in player of squad A hitting squad B's `/game-days/*` routes gets 401/403, and a write body carrying someone else's identity has no effect.

## `frontend/docs/squad-tenancy.md`

Per the rule in `CLAUDE.md`, the implementation PR updates the living reference in the same change:

- A new **"Game day check-in & attendance vote"** section: the three models, `slotsHeld` vs `confirmedIn` and why they must stay separate, the eligibility predicate and why it resolves against the game date rather than today, the clock rules and where they live, `gameDayOps` with its default-off rationale, the per-squad chat ids, and the new routes.
- **Squad schedule** — rewrite. It is no longer "informational only"; this is the first thing that reads it to *do* something. Add `timezone` to the documented `SquadScheduleData` shape.
- **Auth & access model** — note `requireSquadMember` as the member-level gate, and that the five routes which previously inlined it now use it.
- **Routing** — add `/s/[squad]/game-day/[date]` and the new API routes.
- **Explicitly out of scope so far** — remove "anything reading the recurrence schedule to *do* something (auto-create a `DRAFT` game day, drive the Telegram poll)", since half of that is now built; keep the Telegram-poll half and add this plan's deferred items (retiring the old poll, per-squad bot tokens, multiple playing days per week, per-player notifications).

`frontend/docs/components.md` also needs the "Game-day check-in" entry the mockup branch already drafted, corrected for real data (no mocked votes, no `localStorage`), plus the `UserTabBar` note. And one line in `CLAUDE.md`'s "Core domain flow (game day)": the flow now starts at the vote, two days ahead, not at Game Planner.

## Open questions for review

1. **Should the 09:00 / 10:00 / 13:00 / −2h times be per-squad settings** rather than the constants proposed in `voteWindow.ts`? Moving them into `gameDayOps` later is purely additive, but doing it now costs four more settings fields on a card that already has five.
2. **Should a structural holder who voted OUT be allowed onto the open-slot waiting list** for the same day, in case they free up? The plan says no — the two pools stay disjoint, which is what keeps `slotsHeld`'s two terms from overlapping. The alternative is a small relaxation of `getOpenSlotPool` plus a carve-out in the count.
3. **Is hiding the roster until you vote** — inherited from the mockup — the behaviour you want on a real vote, where seeing who is already in is part of deciding whether to come? If it is dropped, note that the stronger version (showing the roster to anyone with the link, signed out) would also invalidate Decision 1's reasoning and needs a token.
4. **Cancelled game days.** The plan cancels silently when an admin adds a `skipDate` after the vote opened. Should that instead post to the main group, given people have already voted and are expecting to play?
5. **Should an admin be able to reopen or extend a closed vote** — a session that cut over at 13:00 but then moved, or a night where the count came up short after the deadline? The plan gives admins close and cancel, but not reopen, on the grounds that reopening after slots were given away has no obviously correct behaviour.
