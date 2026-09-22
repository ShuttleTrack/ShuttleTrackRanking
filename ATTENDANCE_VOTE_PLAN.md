# Game Day Attendance Vote & Open-Slot Assignment — Design Plan

**Status:** Proposed — not implemented. This document is up for review; the implementation follows in a separate PR once the decisions below are agreed. Same shape as `OPEN_SLOT_PLAYERS_PLAN.md` (PR #198, approved before its implementation PR #203) and `SELF_REGISTRATION_PLAN.md` (PR #207).

**Revision:** amended after a review pass, which found real defects rather than wording. The substantive changes: the scheduler is split into two explicit passes (the first draft never said which rows the announce/ping/remind/close steps ran on — if they only touched the row just created, voting would never have closed); creation now scans the whole `today … today + voteOpensDaysBefore` window, so an outage cannot lose a session permanently, and evaluates the squad's **wall-clock** date rather than UTC; creation is a no-op on conflict, since an upsert with an update clause would have refreshed the published clock every five minutes; announce/ping/remind gained an **upper** bound, so a late tick can no longer send "please vote" after the deadline; `syncOpenSlotVacancies` no longer gates *promotion* on having an open-slot chat id or on the anti-spam equality check, gained a direct-claim call site (whose absence left `announcedVacancies` stale and could swallow a later promotion entirely), gained a fourth "filled up" message, and now specifies an explicit `SELECT … FOR UPDATE` — the `SlotReplacement` transaction cited as precedent takes no row lock and does not actually serialise; a new "Eligibility is live" section states what happens to votes and waiting-list rows when a replacement window is created or cancelled mid-vote; Decision 7's prose and the vote table are reconciled and an admin single-slot release added; the Telegram-link fix is corrected — the redirect that drops `callbackUrl` is the **server** one in `resolveSquadUserOrRedirect`, not the client hook; "upcoming" is defined; and the observer view is made to actually render. All five original open questions are resolved; two new ones replace them.

**Second revision:** a second review pass found that the first revision's own fixes had introduced two ordering defects and left the reconciliation rule incoherent. **`announcedVacancies` was written inside the transaction and the retry keyed on it being null** — so after a failed send the column already held the new value and the retry could never fire; it is now advanced only *after* a successful send, and the scheduler simply re-runs the sync on every `VOTING_CLOSED` row before `slotLockAt`, which needs no null special case. **`syncOpenSlotVacancies` cannot open its own transaction** while its callers hold a `SELECT … FOR UPDATE` on the same row — that is a second connection waiting on the caller's own lock — so it becomes `planVacancySync(tx, …)`, taking the caller's client, and only the outermost caller commits and sends. **The reconciliation rule claimed the vote moved with the slot while the steps deleted it**: discarding is correct (nobody inherits someone else's confirmation) and the heading was wrong, but the incoming holder then needs a way to confirm after the deadline, the outgoing holder's open-slot row must be *deleted* rather than `WITHDRAWN` (which is terminal, and would strand them if the window were later cancelled), the helper is a two-sided transfer rather than a per-player sweep, and `approveCancellationRequest` and the shorten path are callers too. Also: the admin `release` action reached the route table and the identity-rule exception it implies; Decision 8 no longer contradicts its own resolved question; disabling a squad from platform admin is named as the separate handler it is; and reconciliation's scope is pinned to existing `VOTING_OPEN`/`VOTING_CLOSED` rows **including today's**, since today's closed vote is exactly the one that must drop a disabled player's IN.

**Scope in one line:** give a squad a real **game day instance** — created two days ahead from its own schedule — that collects an in/out vote from whoever holds a slot that day, runs an open-slot waiting list for everyone else, closes voting at 13:00 to freeze attendance and fill the gap, and announces all of it to two per-squad Telegram groups.

## Context

A squad has **no entity for a future session**. `Squad.schedule` is a JSON blob that `frontend/docs/squad-tenancy.md` calls "informational only" — nothing reads it to *do* anything — and `lib/scheduling/playingDayCalculator.ts` can answer "is date D a playing day?" but only as a forward-looking validation helper for replacement windows. A `Game` row does not exist until an admin opens Game Planner **on the day** and ticks names by hand.

So the availability signal — the thing that decides whether there is a session at all — lives entirely outside the app. It is collected by `lib/telegram/sendEncounterPoll.ts`, a `sendPoll` fired by an in-process cron at 17:00 Europe/Amsterdam with options *In / In (from overflow) / Out / Out (slot passed to someone else)*. Those four options describe this domain almost exactly. **Nobody ever reads the answers back**: there is no webhook, no `getUpdates`, no poll-answer handler anywhere in the repo. The poll is fire-and-forget, and the admin reconstructs the night's roster by scrolling a chat thread.

`OPEN_SLOT_PLAYERS_PLAN.md` (#203) built the roster half of this — `PlayerType.FULLTIME | OPEN_SLOT`, and `SlotReplacement` for a fulltime player handing their slot to an open-slot player over a date range. But it stopped short of per-day availability, and said so: the game-planner's two-pool picker is "a stopgap grouping, **not a real per-day availability system**". This plan is that system.

**In scope:**

- A `GameDay` instance per squad per playing date, created `voteOpensDaysBefore` (default 2) days ahead.
- An in/out vote, from a shareable per-squad URL, restricted to whoever holds a slot that day.
- An open-slot waiting list, open from the moment the game day is created.
- A 13:00 voting deadline that freezes the main vote, computes the shortfall, and assigns waiting-list players to it.
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
2. Its `hooks/useRequireUser.ts` change — redirect to `/login?callbackUrl=<current path>` instead of bare `/login` — is **not** on `main`, and porting it **does not fix the Telegram link**, which is what the first draft claimed. The page's `getServerSideProps` calls `resolveSquadUserOrRedirect`, which returns `{ redirect: { destination: '/login' } }` for a signed-out request with no `callbackUrl` at all. The redirect happens server-side and the client hook never runs. `main`'s login page already honours `callbackUrl` (`utils/loginAuth.ts`); **the redirect that drops it is the server one.** So the real fix is in `lib/squadPage.ts`: build the destination as `/login?callbackUrl=${encodeURIComponent(context.resolvedUrl)}`. Porting the hook change is still worth doing for the client-side session-expiry path, but it is a second-order improvement, not the mechanism.

One inherited product behaviour worth stating rather than leaving implied: **the roster stays hidden until you have voted** (`CheckInView`'s `showRoster`, documented in the branch's `components.md`). That is deliberate in the mockup, not an oversight — but see open question 3.

## Decision 1 — the URL is the readable game date

`/s/{slug}/game-day/2026-09-23`. The mockup's `wed-`/`fri-` prefix is dropped: a squad has exactly one playing day per week, so the weekday is redundant with the date and wrong to encode twice.

The alternative considered was an unguessable token (a `publicId` column, `/game-day/k7x2m9qp`). **Rejected**, but for a narrow reason worth recording: the token would buy nothing here, because the page is not public. It is gated by `resolveSquadUserOrRedirect` — signed in *and* a `Player` row in this squad — and every write re-resolves the caller's eligibility server-side. Guessing the URL therefore reveals nothing to anyone who could not already reach it from their own profile page. A token would only add a lookup, a column, and an unreadable Telegram post.

Note this is the *only* thing making the readable URL acceptable. **If the page is ever made link-public** (open question 3's stronger form, or a future "show the group who's in without signing in"), the date URL becomes a roster leak and the decision has to be revisited *before* that ships, not after.

There is no tokenised-link infrastructure anywhere in this app today — every surface is either fully public or Google-authenticated — so choosing the readable date also avoids being the first thing to introduce one.

## Decision 2 — the old Telegram poll stays, for now

`lib/telegram/sendEncounterPoll.ts`, `lib/telegram/scheduleConfig.ts`'s day-keyed `TELEGRAM_SCHEDULE`, and the 17:00 cron in `instrumentation.ts` are **untouched** by this work. The group will get both the old poll and the new vote link for a while.

Retiring it in the same change was the tidier option and was **rejected on sequencing, not on merit**: this plan replaces a mechanism the club actually relies on every session, and the new one has moving parts the old one does not (a cron that must fire on time, per-squad chat ids that must be configured correctly, a voting deadline that must not mis-assign slots). Keeping the poll means a bad week costs a duplicate message rather than a lost session. Removing it is a small, clean follow-up once the vote has run for a few game days.

The duplication is genuinely temporary and genuinely small: two separate cron registrations, no shared state, no shared config. Nothing in this plan makes the removal harder.

## Decision 3 — the timezone lives in the `Squad.schedule` JSON

Add an IANA `timezone` field to `SquadScheduleData` (`lib/squadSchedule.ts`), validated in `validateScheduleInput` alongside the times it qualifies, defaulting to `Europe/Amsterdam` when absent.

Every clock in this feature (09:00, 10:00, 13:00, start − 2h) is a **wall-clock time in the squad's zone**, and `Squad.schedule` currently stores `startTime`/`endTime` as bare `"HH:mm"` strings with no zone at all. The only timezone in the repo is the `Europe/Amsterdam` hardcoded in `instrumentation.ts`'s cron registration — and the mockup hardcodes the same constant a second time.

It belongs in `schedule` rather than a new column because it qualifies fields that are already there: a start time without a zone is incomplete, and splitting the two apart invites them to disagree. `schedule` is already `Json?`, so this costs **no migration**, and `isRecurring: false` already clears the whole blob, so there is no stale-data path to design.

A dedicated `Squad.timezone` column was considered and rejected: nothing queries or filters by timezone, so a column buys only column count — the same argument that collapsed the original separate schedule columns into this blob in the first place.

## Decision 4 — the 13:00 deadline closes *voting*, not the game day

**Only the vote closes at 13:00.** The session itself has not started — it starts at 19:00 or 20:00 depending on the squad — and nothing about the game day is over. This is worth stating plainly because the obvious naming gets it wrong: a `status` of `CLOSED` on a row called `GameDay` reads as "this game day is finished", which is false for another six or seven hours.

So the stored status is named for what it actually tracks:

```prisma
enum GameDayStatus { VOTING_OPEN VOTING_CLOSED CANCELLED }
```

and the timestamp is `votingClosedAt`, not `closedAt`. Throughout this document "the deadline" means 13:00 on the game date — the moment voting closes and attendance freezes — and never the end of play.

**The session's own phase is derived, never stored.** The mockup already computes `SessionPhase = 'upcoming' | 'live' | 'ended'` from the start and end times in `lib/check-in/schedule.ts`'s `sessionPhase()`, and that stays exactly as it is. It changes purely with the clock, nothing server-side ever acts on it, and storing it would mean a cron tick that exists only to write "this session is now live". The two lifecycles are independent: a game day is `VOTING_CLOSED` from 13:00 onward and is separately `upcoming`, then `live`, then `ended` as the evening passes.

`CANCELLED` sits on the same enum despite being about the game day rather than the vote, because the states are mutually exclusive in practice — a cancelled session has no voting — and a second column to express that would be a column nothing ever reads independently.

**What the deadline actually does:** attendance is frozen, the shortfall against the minimum is computed, and waiting-list players are assigned to it. Game Planner then opens with the confirmed players **pre-ticked**, showing a banner for anyone who dropped out after the deadline and any assigned open-slot player still awaiting confirmation. The admin presses Create Game Day exactly as today.

Auto-creating the `Game` row when voting closes was considered and **rejected**. `calculateGroupDistribution` requires 4–20 players forming groups of 4–5, and `POST /games` rejects any group containing a scoreless player (`findScorelessPlayersInGroups`). Both are conditions the vote can legitimately produce — a thin night, or an open-slot player who has never been given a starting score — and both would fail at 13:00 with no admin present to see the error and nowhere sensible to report it. Pre-selection captures nearly all the value and cannot fail.

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

The two terms are **disjoint by construction** — a player is either a structural holder (Decision 5's first table) or in the open-slot pool, never both — which is what makes this a clean sum rather than a set union. **An assigned player who has not voted yet still holds their slot**: it is reserved for them and must not be offered to the next person on the waiting list. This is also what stops the deadline pass from looping — promoting *n* players raises `slotsHeld` by *n* immediately, so the shortfall reaches zero on the same pass.

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
| **Auto-assigned from the waiting list** at or after the voting deadline | yes, until `slotLockAt` (session start − 2h) |
| **Claimed directly** from the post-deadline "slots available" link | no — it is theirs |

The asymmetry looks like an inconsistency and is not. A waiting-list player asked to be *considered*; the system then handed them a slot, possibly hours later, possibly for an evening they can no longer make. A direct claimer looked at "3 slots open" and took one, at that moment, deliberately. The first is an offer that can be declined; the second is an acceptance.

It also has the right incentive shape: giving up a waiting-list assignment early reopens the slot with enough runway (2h) for the group to fill it, which is the whole reason for the deadline. After `slotLockAt` nobody can realistically be found, so the slot stops being transferable for everyone.

A direct claimer's page therefore shows **"I'm in" only** — their vote is a confirmation, never a withdrawal.

## Decision 8 — the waiting list is this squad's open-slot roster

Eligible to join: `OPEN_SLOT` players on this squad's roster, not covering an active replacement on that date, not `DISABLED`. This is exactly the complement of Decision 5's voter pool within the open-slot population, so the two pools are disjoint and one page can serve both roles without a mode switch.

Two alternatives were considered:

- **Letting a structural holder who voted OUT join the waiting list**, in case they free up. Not proposed — it makes the pools overlap and `slotsHeld`'s two terms non-disjoint, for a case ("I'm out, but maybe") the vote can already express by simply not voting out. **Settled in review: no.** The disjoint-pool rule is load-bearing, and the hole worth closing was a replacement window opened after voting started - see "Eligibility is live" - not a second way into the queue.
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
enum GameDayStatus { VOTING_OPEN VOTING_CLOSED CANCELLED }
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
  status     GameDayStatus @default(VOTING_OPEN)

  // Absolute instants, resolved from the snapshot above at creation. Stored rather than
  // recomputed so the scheduler compares two instants and never re-derives a wall clock.
  votesCloseAt DateTime @map("votes_close_at")
  slotLockAt   DateTime @map("slot_lock_at")     // session start - 2h

  // One nullable timestamp per one-shot message. The scheduler's guard is
  // "threshold passed AND stamp is null", never "now == threshold" - see "Scheduler".
  announcedAt      DateTime? @map("announced_at")
  remindedAt       DateTime? @map("reminded_at")
  openSlotPingedAt DateTime? @map("open_slot_pinged_at")
  votingClosedAt   DateTime? @map("voting_closed_at")

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

The snapshot columns are the part most likely to be questioned as redundant, so to be explicit: they exist because **a game day is a published promise**. Once "vote by 13:00 Wednesday" has gone to a Telegram group, an admin fixing an unrelated typo in the schedule must not retroactively move that deadline, and an admin raising the minimum from 16 to 18 must not silently reopen slots on a session whose voting has already closed.

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

Stamped when the planner creates a `Game` from a game day whose voting has closed, so the throwaway session state can be traced back to the attendance that produced it.

**`@unique` means a second create needs a defined answer.** The planner already has both a create and an edit path (`isEditing && gameId` → `updateGame`), and a draft can be discarded and rebuilt. Without a rule, the second create violates the unique index and surfaces as a 500. The rule: **`POST /games` stamps `gameDayId` only when that game day has no game yet; if one exists, it answers 400 — "this game day already has a game"** — naming the existing game so the admin can open or delete it. Replacing a draft is the existing edit path, which does not touch the link.

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

### Eligibility is live; the rows already written are not

The disjointness above holds **at the moment you evaluate it**. But a vote opens two days out, and a `SlotReplacement` can be created or cancelled during that window covering the same date — `createSlotReplacement` has no rule against it. So eligibility can change under rows that already exist, and the first draft said nothing about what happens to them. Three concrete cases, all of which need a stated rule rather than emergent behaviour:

- **The owner voted IN, then handed their slot over.** They are no longer a structural holder. If `slotsHeld` counts only *current* holders, the slot silently vanishes from the count until the replacement votes; if it counts every IN row, owner and replacement are both in, which Decision 5 forbids.
- **The replacement was already `WAITING` on this game day.** They are now in both pools at once, and the deadline pass can hand them a second slot.
- **A player is set `DISABLED`, or an open-slot row is `WITHDRAWN`, after they voted.** Their IN row still exists.

**Rule: the slot transfers; the vote does not.** The previous revision's heading claimed the vote moved with the slot while the steps beneath it simply deleted the vote — the vote was discarded, not transferred. Discarding is the right behaviour, and the heading was the thing that was wrong: inheriting someone else's IN would mark the incoming holder as confirmed when they have never said a word, which is exactly what Decision 6 forbids for assigned open-slot players. **Every person speaks for themselves.**

A slot transfer covering a `VOTING_OPEN` or `VOTING_CLOSED` game day reconciles that game day **in the same transaction as the replacement change**:

1. **Delete the outgoing holder's `GameDayVote` row.** They no longer hold the slot, so they no longer have a vote; the count drops and the UI shows them as an observer.
2. **Delete the incoming holder's `GameDayOpenSlot` row**, whatever its status — `WAITING` *and* `ASSIGNED` alike — so they cannot hold a structural slot and an open slot at once. **Deleted, not `WITHDRAWN`.** `WITHDRAWN` is terminal (see below), and marking it that way would mean that cancelling the window later leaves the player unable to rejoin the queue they were removed from by a system action they did not take. `WITHDRAWN` stays terminal only when *the player themselves* gave a slot back.
3. **Call `planVacancySync`**, since step 1 may have widened the gap.

**The incoming holder must be able to confirm after the deadline.** A structural holder's slot is only counted once they vote IN, so someone who gains a slot after 13:00 starts out uncounted — and the post-close "IN rejected" rule would leave them permanently unable to say they are coming. So: **a player who gains a structural slot after voting has closed may vote IN until `slotLockAt`**, exactly as an assigned open-slot player may. This cannot over-fill anything, because `minPlayers` is a *minimum* that triggers the open-slot flow, never a cap — `vacancies` simply floors at zero.

That also answers the reverse case. If the window is cancelled and the owner takes their slot back after the deadline, their old vote is gone and is **not** restored — but they may vote IN under the same rule. "Cancelling reverses it" therefore means the slot and the right to vote return, not that a deleted vote reappears; the end-to-end step says so explicitly.

**Four callers, not two.** A window does not only begin at `createSlotReplacement`. It ends at **`approveCancellationRequest`**, and a **shorten** can pull `endDate` back before a game date without ever setting `cancelledAt`. All of `createSlotReplacement`, `approveCancellationRequest`, the shorten path, and the admin release must reconcile, or the vote stays with a player who no longer holds the slot.

**The helper is a transfer, not a per-player sweep.** `reconcileGameDaysForPlayer(squadId, playerId, fromDate)` was the wrong shape: the rule has an outgoing *and* an incoming side, and a per-player helper called from both sides would delete the incoming holder's vote too. Two functions:

```ts
reconcileSlotTransfer(tx, { squadId, outgoingPlayerId, incomingPlayerId, fromDate, toDate })
removePlayerFromGameDays(tx, squadId, playerId)   // the DISABLED case - no incoming side
```

**Scope: game days that already exist and are `VOTING_OPEN` or `VOTING_CLOSED`, including today's.** At most `voteOpensDaysBefore` rows. It does not walk the replacement window (up to four months) and never creates a game day in order to reconcile it — a date with no row has nothing to reconcile, and the scheduler will create it correctly later. **"Future only" is wrong**: today's already-closed vote is precisely the row that must lose a disabled or replaced player's IN, or `slotsHeld` keeps counting someone `getGameDayVoters` has already dropped.

`getGameDayVoters` is therefore not merely a read the UI uses — it is the invariant these writes maintain, and every count in this document assumes it holds.

## Vote rules: `lib/gameDay/votes.ts` (new)

`castVote(squadId, gameDayId, playerId, choice)`, throwing `ValidationError` (`lib/api/validationError.ts`) for caller error so routes answer 400 with a reason rather than a blanket 500 — the pattern `lib/replacements.ts` and `players/bulk-initial-score.ts` already use.

| Voter | Voting open | Voting closed, before `slotLockAt` | After `slotLockAt` |
|---|---|---|---|
| Structural slot holder | IN and OUT freely, any number of times | **IN rejected** — "voting has closed"; OUT allowed **only from a current IN** | OUT still allowed, but **no longer reopens a slot** |
| Structural holder who **gained** the slot after the deadline (a cancelled/shortened window) | n/a | IN allowed — their confirmation, same right as an assignee; OUT allowed | **IN rejected**; OUT allowed, reopens nothing |
| Assigned open slot, `source: WAITING_LIST` | n/a — assignment only happens once voting has closed | IN allowed (their confirmation); OUT allowed, and releases the slot | **OUT rejected** — too late to refill |
| Assigned open slot, `source: DIRECT` | n/a | IN allowed; **OUT rejected** — "this slot is yours" | same |
| Anyone else | rejected — not a voter | rejected | rejected |

`CANCELLED` rejects everything.

Reaching the deadline with no vote row at all means you are already out, so an attempt to go OUT is rejected with the same message as IN rather than writing a row that means nothing.

**The third column reconciles a contradiction in the first draft.** Decision 7's prose said that past `slotLockAt` "the slot stops being transferable for everyone", but the table applied the lock only to a waiting-list assignee — so a structural holder could vote out at 18:50, and that path called `syncOpenSlotVacancies`, which would cheerfully post "spots still open" to a group that has ten minutes' notice. Both halves are fixed: a holder may still record that they are not coming (the admin needs the truth for the planner, and people's evenings really do change), but **`syncOpenSlotVacancies` is a no-op past `slotLockAt`** — no promotion, no post. Dropping out late is information, not a vacancy.

**An unconfirmed direct claim needs an escape hatch, and it is an admin one.** A direct claimer cannot vote OUT at all, including before they have confirmed — so an unconfirmed direct claim sits in `slotsHeld`, stays out of `confirmedIn`, and nothing ever re-offers it. One mis-tap holds a court slot for the night. Rather than weakening Decision 7, the answer is an **admin release**: `PATCH /game-days/[date]/admin` with `{ action: 'release', playerId }` sets the entry `WITHDRAWN` and calls the same sync. This is also the answer to old open question 5 — releasing one slot is the operation that was actually missing on day one, not reopening a whole vote.

Every transition that can widen the gap — a holder's post-deadline IN → OUT, an assignee's OUT, a direct claim, an admin release — is followed by `syncOpenSlotVacancies`.

## Open slots: `lib/gameDay/openSlots.ts` (new)

**The vacancy sync is the core of the feature.** Several of the stated requirements turn out to be the same event observed at different moments, so they are one operation - `planVacancySync(tx, gameDayId)` inside the caller's transaction, plus a send the caller performs after commit:

**Assigning and announcing are two separate concerns, and the first draft fused them** — it returned early when the open-slot chat id was missing, *before* promoting anyone, so a squad that configured the vote but not the second Telegram group would never assign its waiting list at all. A missing chat id may silence the post. It must never silence the assignment.

**`syncOpenSlotVacancies` never opens a transaction of its own.** It takes the caller's transaction client, the way `SELF_REGISTRATION_PLAN.md` passes one into `addPlayer`. `joinOpenSlot` and the close-voting path already hold a `SELECT … FOR UPDATE` on the `GameDay` row; if sync locked and committed on its own it would be a *second connection waiting on a lock the caller holds* — a self-deadlock — or it would commit the caller's half-finished work early. InnoDB does not treat a nested Prisma `$transaction` as one lock.

So the shape is: **the outermost caller owns the lock, the transaction, and the send.**

```
// Inside the CALLER's transaction, which already holds SELECT ... FOR UPDATE on the GameDay row.
// The caller must have written its own change (the ASSIGNED row for a direct claim, the OUT vote,
// the deleted vote for a reconciliation) BEFORE calling this, or the counts will not see it.
planVacancySync(tx, gameDayId) -> VacancyPlan

  if status != VOTING_CLOSED, or minPlayers is null -> { nothing }
  if now >= slotLockAt -> { nothing }                  // nothing can be filled this late

  slotsHeld = count(votes IN by structural holders)
            + count(openSlots where status = ASSIGNED) // disjoint; unvoted assignees still hold
  vacancies = max(0, minPlayers - slotsHeld)

  // ALWAYS promote, whatever announcedVacancies says and whether or not a chat id exists.
  promoted = take(vacancies) from openSlots where status = WAITING, ordered by joinedAt
    -> ASSIGNED, source = WAITING_LIST, assignedAt = now
  remaining = vacancies - promoted.length              // reaches 0 on this pass; cannot loop

  return { promoted, remaining, changed: remaining != announcedVacancies || promoted.length > 0 }

// ---- caller COMMITs here ----

// Then, and only then:
if no open-slot chat id -> set announcedVacancies = remaining   // so this never retries
else if plan.changed:
  message =
    promoted > 0 && remaining > 0  -> "<names> are in. <n> spots still open: <url>"
    promoted > 0 && remaining == 0 -> "<names> are in. The session is full."
    promoted == 0 && remaining > 0 -> "<n> open slots for <date>. First come, first served: <url>"
    promoted == 0 && remaining == 0 && a ping went out earlier
                                   -> "<date> filled up - no open slots needed. Thanks!"
  if send(message) succeeded -> set announcedVacancies = remaining
  // on failure: leave announcedVacancies alone, so the next pass sees changed == true and retries
```

**`announcedVacancies` advances only on a successful send.** The previous revision wrote it inside the transaction and *then* sent, while also claiming the scheduler would retry rows where it was still null — which is the opposite of what that order produces: after a failed send the column already held `remaining`, so the retry condition was never true and the lost message was lost for good. Writing it after the send is what makes the name honest — it is "the vacancy count the open-slot group has actually been told", not "the vacancy count we computed".

Four call sites, not three:

1. **When voting closes (13:00).** `announcedVacancies` is null, so it always posts.
2. **After a structural holder's post-deadline IN → OUT.** The gap grew.
3. **After a waiting-list assignee votes OUT before `slotLockAt`.** The gap grew, and the next person on the list is promoted on the same pass.
4. **After a direct claim** — the claim's `ASSIGNED` row is inserted in the same transaction *before* the plan counts, or the count will not include it. Missing from the first draft, and its absence was not merely a missed notification: `announcedVacancies` is written *only* on this path, so a direct claim lowered the real vacancy count and left the stored one stale. The next OUT that happened to bring the count back to that stale number would hit the equality check and return **before promoting anybody**.
5. **After a slot transfer or an admin release** — see "Eligibility is live" below.
6. **On every scheduler Pass B tick**, for `VOTING_CLOSED` rows before `slotLockAt` — the retry path above.

**The fourth message matters more than it looks.** `promoted == 0 && remaining == 0` sent nothing in the first draft. Combined with the 09:00 ping — which compares `confirmedIn` four hours before the deadline, when most people have not voted yet — the common case is: ping goes out at 09:00, everyone votes in by 13:00, the shortfall is zero, and the open-slot group that was asked for help is never told the session filled. That is exactly the situation people remember when they stop trusting the bot.

**Concurrency needs a real row lock, and the precedent does not provide one.** An earlier revision pointed at `createSlotReplacement`'s `$transaction` as the pattern. That transaction does a plain `findFirst` then `create` with **no `SELECT … FOR UPDATE`**; under InnoDB's default `REPEATABLE READ` two concurrent transactions can both read "no overlap" and both insert. `@@unique([gameDayId, playerId])` does not help here either, because the racing claims are from *different* players. So this plan does not inherit that pattern — every entry point wraps its work in

```ts
withGameDayLock(gameDayId, async (tx) => { /* writes, then planVacancySync(tx, gameDayId) */ })
```

which takes `SELECT … FOR UPDATE` on the `GameDay` row via `$queryRaw` as the first statement in the transaction. One lock, one transaction, one commit, for `joinOpenSlot`, `castVote`, the close-voting path, the admin release and the reconciliation alike.

**The send is not transactional, and must be retryable.** Telegram is called *after* commit — holding a row lock across a network call to an external service is not acceptable at this cadence — so a send can fail with the assignments already durable. The recovery rule is simply that **Pass B of the scheduler runs the sync on every `VOTING_CLOSED` row that is still before `slotLockAt`.** No special case is needed: a successful send has advanced `announcedVacancies`, so `changed` is false and the pass is a no-op; a failed one has not, so the next tick retries it. The same pass therefore covers both the message lost at close and any later one, and stops by itself at `slotLockAt`.

**Joining and claiming** — `joinOpenSlot(squadId, gameDayId, playerId)`, inside the same locked transaction:

- The player must be in `getOpenSlotPool` for this date, and must not already have a `WITHDRAWN` row (below).
- `status === VOTING_OPEN` → insert `WAITING`. The 09:00 ping is not a precondition (Decision 8).
- `status === VOTING_CLOSED` → recompute `vacancies` **inside the lock**; `> 0` → insert straight to `ASSIGNED, source: DIRECT`, then call `syncOpenSlotVacancies`; `== 0` → `ValidationError`, "no open slots available".
- Past `slotLockAt` → rejected outright.

**Leaving** — `leaveOpenSlot(squadId, gameDayId, playerId)` handles only the `WAITING` case: delete the row, since it is just a queue, and a deleted row can be re-created if they change their mind. Giving up an **assigned** slot goes through `castVote(OUT)` (Decision 6), so there is exactly one code path that releases a slot.

**`WITHDRAWN` is terminal for that player on that game day.** `@@unique([gameDayId, playerId])` means a withdrawn player cannot simply re-insert, and the first draft never said which way that resolved. It resolves as terminal: having been given a slot and handed it back, you do not go back in the queue ahead of people who have been waiting. A re-claim attempt is a `ValidationError` with that reason, not a unique-constraint 500.

## Scheduler: `lib/gameDay/scheduler.ts` (new), registered in `instrumentation.ts`

A second `cron.schedule` alongside the existing 17:00 poll, **inside the same `process.env.NEXT_RUNTIME === 'nodejs'` block**. That exact `===` form is load-bearing: `src/middleware.ts` forces Next to compile `instrumentation.ts` for the edge runtime too, and only this form is what the build-time substitution and dead-code elimination recognise to drop the branch and its dynamic `node-cron` import from the edge bundle. An inverted early-return guard was tried once and broke the production build. The new registration goes *inside* that block, never beside it, with its own `global.__…Registered` flag.

**Cadence: every 5 minutes** (`*/5 * * * *`), not a fixed daily time. The thresholds are wall-clock times in each squad's own zone, so no single UTC cron can hit 09:00, 10:00 and 13:00 for every squad — and a fixed-time cron would drift by an hour twice a year with DST, silently, in whichever direction hurts most.

### The tick, in two passes

A tick has **two distinct passes over different sets of rows**, and conflating them is the mistake the first draft made — it described creation on one date and then listed the announce/ping/remind/close steps without saying which rows they ran on. If those steps only touched the row just created, voting would never close.

**Pass A — creation and cancellation**, over *candidate dates*, for every `enabled` squad with a recurring schedule and `gameDayOps.enabled`:

- **Scan every squad-local date from today through today + `voteOpensDaysBefore`**, not just the single date `voteOpensDaysBefore` ahead. A tick that only looks at one date loses a session permanently if the process is down for the whole day that date was in range: the next tick looks past it and the row is never created. Scanning the window means any tick within `voteOpensDaysBefore` days recovers it. (This is also what makes the 14-day cap on `voteOpensDaysBefore` a real bound — the first draft justified the cap by "the scheduler walks dates a day at a time" when the algorithm as written never walked. Now it does.)
- For each candidate date that `isPlayingDay`, **create** a `GameDay` if none exists, snapshotting times, timezone and the minimum, and resolving `votesCloseAt` / `slotLockAt` through the clock module.
- For each `VOTING_OPEN` row whose date is **no longer** a playing day (an admin added a `skipDate`, or ended the recurrence) → `CANCELLED`, and **skip every remaining step for that row in this same tick**. Otherwise a day cancelled at 08:58 still gets a 09:00 ping. Cancellation posts to the main group when `announcedAt` is set — those people were already told to vote (resolved open question 4).

**"Today" is the squad's wall-clock date, not UTC.** `isPlayingDay` compares `getUTCDay()` and UTC `YYYY-MM-DD` strings, and the four copies of `todayDateOnly()` in `lib/ranking/*` and `lib/replacements.ts` are all UTC midnight. At 00:30 in Amsterdam that is still the previous UTC date, so a naive tick would evaluate the wrong day. Build the candidate as a **UTC date-only value constructed from `wallClockIn(now, timezone)`**, then hand *that* to `isPlayingDay`. Step through candidates by adding calendar days to the year/month/day — never by adding 24-hour multiples to an instant, which breaks across a DST boundary.

**Creation must not be an upsert with an update clause.** A Prisma `upsert` that rewrites `startTime`, `timezone`, `minPlayers` and `votesCloseAt` on conflict would refresh the published clock every five minutes for the whole time the vote is open — precisely the opposite of the snapshot rule. **The conflict path is a no-op** (`update: {}`), or equivalently a create guarded by a prior existence check inside the same transaction.

**Pass B — the message and deadline steps**, over **every `GameDay` in this squad with `status === VOTING_OPEN`** (plus, for the last step, any `VOTING_CLOSED` row still needing a vacancy sync — see "the send is not transactional" below). These are rows created on *earlier* ticks; that is the whole point.

| Step | Fires when | Stamp |
|---|---|---|
| **Announce** | `announcedAt` is null | `announcedAt` |
| **Open-slot ping** | past 09:00 squad-local on the game date, `openSlotPingedAt` is null | `openSlotPingedAt` **either way**, with the skip reason logged, so a decided-not-to-send never retries |
| **Remind** | past 10:00 squad-local, `remindedAt` is null | `remindedAt` |
| **Close voting** | past `votesCloseAt` | → `VOTING_CLOSED` + `votingClosedAt`, then `syncOpenSlotVacancies` |

The ping additionally requires the minimum *and* the open-slot chat id to be configured, and `confirmedIn` to be below the minimum (Decision 6).

**Catch-up is bounded at both ends.** "Threshold passed AND stamp is null" alone is not enough: at 18:00, "past 10:00 and `remindedAt` is null" is still true, so a tick that finally runs after a long outage would send "please vote" and then immediately close voting — and could fire the 09:00 open-slot ping after the session had already started. **Announce, ping and remind all additionally require `status === VOTING_OPEN` and `now < votesCloseAt`.** Past the deadline they are stamped-as-skipped rather than sent. Closing is the only step with no upper bound, because closing late is still correct.

**Disabling a squad must not strand open rows.** Turning `gameDayOps.enabled` off removes the squad from the sweep entirely, which would leave any `VOTING_OPEN` row accepting votes forever and never closing. So disabling is an explicit action on the `game-day-ops` route, not merely a flag the cron reads: it **cancels every `VOTING_OPEN` row for that squad** in the same request (posting the cancellation as above). The cron's `gameDayOps.enabled` check then only governs *creating* new rows. The same cancellation must also run when a squad is disabled from platform admin, which is a **different handler** - `PATCH /api/squads/[squadId]` (superadmin-only, `enabled`) - not the `game-day-ops` route. Both call one shared `cancelOpenGameDays(squadId, reason)`; naming only one of them would leave a platform-disabled squad with its votes still running.

Each squad's tick is wrapped in its own try/catch, so one squad's failure — a revoked chat id, a Telegram outage, a malformed `gameDayOps` blob — cannot abort the sweep for the others. Pass A and Pass B are separately wrapped per squad, so a creation failure does not stop that squad's votes from closing.

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
| `index.ts` | GET — upcoming game days (defined below), with the caller's vote/slot state per day | squad member |
| `[date]/index.ts` | GET — one game day: snapshot, status, countdown, my role, my vote, IN/OUT rosters, assigned open slots, awaiting-confirmation list, `confirmedIn`, `slotsHeld`, vacancies | squad member |
| `[date]/vote.ts` | PUT — `{ choice: 'IN' \| 'OUT' }` | squad member, must be a voter for that date |
| `[date]/open-slot.ts` | POST — join the waiting list / claim a slot | squad member, must be in the open-slot pool |
| " | DELETE — leave the **waiting list** (giving up an assigned slot is `PUT vote { OUT }`) | same |
| `[date]/admin.ts` | GET — full attendance for the planner; PATCH — `{ action: 'close' \| 'cancel' \| 'release', playerId? }` | `requireSquadAdmin` |
| `../schedule.ts` | PATCH — gains `timezone` | existing route, `requireSquadAdmin` |
| `../game-day-ops.ts` | PATCH — the `gameDayOps` blob via `validateGameDayOpsInput` | `requireSquadAdmin` |

`GET /api/squads/[squadId]` gains the unpacked `gameDayOps` fields on the wire, exactly as it already unpacks `schedule` into flat `scheduleXxx` names, so `useSquadSettings()` keeps its flat shape and the settings page needs no new hook.

**`[date]` is `YYYY-MM-DD`.** Reject anything else with a 400 before touching the database, then resolve by `@@unique([squadId, gameDate])`. A valid date with no row is a 404 — which is also what a guessed URL for a non-playing day gets.

**"Upcoming" means the session has not ended, not that voting is open.** The obvious reading — `VOTING_OPEN` rows only — is wrong, and would make the profile list and the Check-in tab vanish at 13:00 on the very day people need them: the session is still that evening, assigned players still have to confirm, and holders can still drop out. `GET /game-days` returns **non-`CANCELLED` rows whose session end time has not passed in the squad's own zone**, ordered by date. That is the same `sessionPhase(gameDay, now) !== 'ended'` predicate the mockup already computes client-side (Decision 4), evaluated server-side with the row's stored `timezone`.

### One refactor this work should carry: `requireSquadMember`

There is **no member-level auth helper today.** `replacements/index.ts`, `replacements/preview.ts`, `players/open-slot.ts`, `games/my-matches.ts` and `user/scores.ts` each inline `getServerSession`, `getSquadAccess(email, squadId)`, and an `isSuperAdmin` bypass.

**They are not all the same predicate, though, and a naive extraction would break one of them.** `replacements/index.ts` gates on `if (!player && !isAdmin) 401` — an admin with no `Player` row *passes*, and the default scope then returns `[]`. A helper that requires a `Player` row would 401 those admins. So the helper is deliberately the weaker of the two checks:

```ts
// "signed in, and connected to this squad somehow" - a Player row OR admin rights.
// It does NOT guarantee a player, because several existing callers legitimately admit an
// admin who has none. Routes that act *as a player* must resolve and require one themselves.
requireSquadMember(req, res, squadId): Promise<{ session: Session; player: Player | null } | null>
```

Returning the resolved `player` alongside the session is what makes that safe: the new vote and open-slot routes need a real player and reject `player === null` with a 403 explaining that a superadmin without a roster entry cannot vote — the superadmin bypass gets them past the gate, not into the ballot. Existing call sites move onto the helper unchanged in the same PR.

### The identity rule, unchanged

`SELF_REGISTRATION_PLAN.md`'s one security property applies here verbatim: **the acting player is resolved from `getSquadAccess(session.user.email, squadId)`, never from a request body.** A vote body carries `choice` and nothing else; an open-slot POST carries nothing at all. This is the one thing in the plan that is a security property rather than a correctness one, so it gets a route-level test per write path, not just a review note.

**`[date]/admin.ts`'s `release` is the single deliberate exception**, and it has to be called out or the boundary test contradicts it. Releasing a slot *is* an admin acting on another player, so that body carries a `playerId` and it is honoured. The rule is unchanged in substance — the **actor** still comes from the session, and `requireSquadAdmin` has already established that this actor may act on the squad. The boundary test therefore reads: a body naming another player has no effect on **every route except this one**, where it is the point.

## UI

**`pages/s/[squad]/game-day/[date].tsx`** — the mockup page, renamed from `[uid]`, still gated by `resolveSquadUserOrRedirect`. Everyone in the squad passes that gate; the page branches on the role the API returns:

- **voter** (structural holder, or an assigned open-slot player) — `CheckInVoteButtons` exactly as the mockup draws them. Past the deadline, "I'm in" is disabled with a "voting has closed" note while "I'm out" stays live for anyone currently IN. A `DIRECT` claimer sees "I'm in" only, with a line saying the slot is theirs (Decision 7).
- **open-slot, not yet assigned** — the vote buttons are replaced by *Join waiting list* / *Leave waiting list* before the deadline, and *Claim a slot* after, reusing `CheckInVoteButtons`' two-button geometry and token styling so the page still reads as one design.
- **observer** (a covered fulltime owner, or a platform superadmin with no `Player` row — a case `resolveSquadUserOrRedirect` explicitly admits) — roster and status only, with one line saying why they cannot act.

**Two mechanical things in the mockup defeat the observer case as written, and both must change:**

- `[uid].tsx` ends with `if (playerId === null) return null`, and `resolveSquadUserOrRedirect` returns `playerId: null` for exactly the superadmin-with-no-`Player`-row case. Kept as-is, that page renders blank for the observer the plan just introduced. It has to render the observer view instead of returning null.
- `useRequireUser(playerId !== null)` pushes `!isUser` to `/`, which fights the same case from the client side. The call has to be `useRequireUser(true)` here (the server gate has already decided access), or the hook's `!isUser` branch skipped on this page.

**"Roster hidden until you vote" applies to voters only.** `CheckInView` sets `showRoster = myVote !== null`, and a covered owner, a superadmin and an unassigned open-slot player never get a vote row — so under that rule none of them ever sees the roster, which directly contradicts the observer line above. Those two instructions cannot both be implemented. Resolution: **the gate is "you are a voter and have not voted yet"**; everyone who cannot vote sees the roster immediately, because there is nothing for them to withhold it against. It is never shown to a signed-out visitor — that is what keeps Decision 1's readable URL acceptable.

`CheckInRoster` gains a third group for **assigned open slots**, with an *awaiting confirmation* marker on assignees who have not voted — the visible consequence of Decision 6. `CheckInPlayerRow` is unchanged: `colorHex` disc, name, rank, **You** chip.

**`UpcomingSessionsList`** on the profile page swaps its two hardcoded weekday slots and its `localStorage` vote chip for the `GET /game-days` response. `UserTabBar`'s Check-in tab links at the nearest upcoming game day from the same data.

**`hooks/useGameDayCheckIn.ts`** becomes SWR over the two GET endpoints, with optimistic vote mutation and `mutate()` revalidation — the shape `user/replacement.tsx` already uses.

**Squad settings** (`pages/s/[squad]/admin/settings.tsx`) gains a **"Game day check-in"** card in the existing hand-rolled token style (`cardClass` / `inputFieldClass` / `primaryBtn`, as the "Open-slot players" card does) with an enable toggle and the four `gameDayOps` fields, plus a **timezone** select on the existing Play-schedule card.

**Game Planner** (`pages/s/[squad]/admin/game-planner.tsx`) reads today's game day once voting has closed and pre-ticks **`confirmedIn` players only**, with a banner listing anyone who went OUT after the deadline and any assigned open-slot player still awaiting confirmation — so the admin decides about the unconfirmed rather than finding them silently ticked. `calculateGroupDistribution`, the rank-order slicing, the scoreless gate and the two-pool picker are all **unchanged**; this only seeds the initial selection. On create, stamp `Game.gameDayId`.

DaisyUI stays out of the player-facing pages — they follow `docs/design.md` tokens like the rest of the mockup. Any admin oversight table added here follows `ReplacementOversight.tsx` instead. The codebase is deliberately inconsistent between these two idioms along the admin/player line, and this change keeps to that line rather than blurring it.

## Testing / verification (for the implementation PR)

**Unit tests**, using the `vi.mock('@/lib/prisma', …)` pattern from `lib/replacements.test.ts` and `lib/ranking/absenteeSpell.test.ts`:

- **`clock.test.ts`** — `instantAt` round-trips against `wallClockIn` across a DST spring-forward and a fall-back in `Europe/Amsterdam`, and in a second zone with a different offset; 09:00/10:00/13:00 land on the right instants either side of each transition.
- **`eligibility.test.ts`** — a covered fulltime owner is excluded and their filler included **for the game date, not today** (a window active on the game date but not today, *and* the reverse — this is the regression test for reusing a today-based helper); a cancelled window excludes nobody; a `DISABLED` player is in no pool; structural holders and the open-slot pool never intersect; an assigned open-slot player is returned by `getGameDayVoters` but not by `getStructuralSlotHolders`.
- **`counts.test.ts`** — the two numbers. An assigned player who has not voted counts in `slotsHeld` but not `confirmedIn`; one who votes IN counts in both and is **not double-counted**; one who votes OUT counts in neither.
- **`votes.test.ts`** — free switching while voting is open; IN rejected after the deadline for a structural holder; OUT after the deadline accepted only from a current IN; no-vote OUT after the deadline rejected; a vote from a non-voter rejected; an assigned `WAITING_LIST` player's OUT succeeds before `slotLockAt`, fails after, and flips the entry to `WITHDRAWN` in the same transaction; a `DIRECT` claimer's OUT always fails; `CANCELLED` rejects everything.
- **`openSlots.test.ts`** — promotion is strictly `joinedAt` order; **the deadline pass promotes exactly `vacancies` players and does not loop** (the regression test for the double-count Decision 6 fixes); a direct claim past the deadline succeeds while vacancies remain and 400s at zero; two concurrent claims for one slot leave exactly one winner.
- **`syncOpenSlotVacancies.test.ts`** — posts when voting closes, with and without a waiting list; **does not** post when the vacancy count is unchanged (the anti-spam property) **but still promotes**; **promotes with no open-slot chat id configured, skipping only the post**; sends the "filled up" message when a ping went out and the shortfall closed; posts again when a post-deadline OUT widens the gap; a direct claim updates `announcedVacancies` so a later OUT is not swallowed by the equality check (the stale-counter regression); no-op past `slotLockAt`; no-ops entirely when the minimum is unset.
- **`scheduler.test.ts`** — against a pure `decideGameDayActions(gameDay, now)` returning the due actions, so the threshold logic is testable without cron, env or `fetch`: a tick at 13:04 still closes voting; an already-stamped action is not repeated; a skip-dated day is cancelled and **none of its other steps run in that same tick**; a tick at 18:00 with `remindedAt` null does **not** send the reminder (the upper bound); creation scans the whole `today … today + voteOpensDaysBefore` window so a missed day is recovered; the candidate date is the squad's wall-clock date, not UTC (a tick at 00:30 Amsterdam evaluates the right day); a second tick does **not** rewrite an existing row's snapshot.
- **`reconcile.test.ts`** — `reconcileSlotTransfer` deletes the outgoing holder's vote and **deletes** (never `WITHDRAWN`s) the incoming holder's open-slot row, from both `WAITING` and `ASSIGNED`, then syncs; the same runs from `approveCancellationRequest` and from a shorten that pulls `endDate` back before the game date without setting `cancelledAt`; cancelling a window lets the owner vote IN again after the deadline but does **not** resurrect their deleted vote; a player whose open-slot row was removed by a transfer can rejoin the waiting list once the window is cancelled (the terminal-`WITHDRAWN` trap); `removePlayerFromGameDays` on a `DISABLED` player clears **today's already-closed** game day as well as later ones, and reconciliation never creates a game day row.
- **`gameDayOps.test.ts`** — mirrors `squadSchedule.test.ts`: `enabled: false` clears the rest; an out-of-range `voteOpensDaysBefore` is rejected; a chat id set without the feature it belongs to is rejected with a clear message.
- **`notifications.test.ts`** — the four message bodies and the absolute URL.
- **Route-level tests** that each write path ignores any identity in the body and uses the session's — the security property from "The identity rule".
- `playingDayCalculator.test.ts` and `characterization.test.ts` must pass **unmodified**. Note `characterization.test.ts` is *not* a safety net here: it exercises only the pure `calculateElo` / `decideAbsenteeAction` / `computeActivationScore` functions, and nothing in this plan touches the ranking math, so it would pass regardless.

**Migration:** apply with `node scripts/prisma-migrate-deploy.mjs` against the local compose DB, then confirm the `migrate diff --exit-code` drift check exits 0.

**End-to-end, in a browser against `npm run dev`.** Add a superadmin "run scheduler tick now" action, mirroring the existing Telegram-test buttons on the admin dashboard, so a full cycle does not take two real days:

1. A squad with no recurring schedule, or with `gameDayOps` unset, creates no game day and logs a skip — existing squads are unaffected until an admin opts in.
2. Configure schedule + timezone + `gameDayOps`; tick → a `GameDay` appears for the date `voteOpensDaysBefore` ahead, and the main group gets the vote-is-open post with a working link.
3. Open that link **signed out** → `/login?callbackUrl=…` → after sign-in you land back on the vote page. This exercises the **server-side** redirect fix in `resolveSquadUserOrRedirect`, not the client hook - the whole share-a-link premise depends on it.
4. Vote IN, then OUT, then IN again while open. Confirm the roster stays hidden until the first vote.
5. As a fulltime player **with an active replacement covering that date**, confirm the page is read-only with a reason — and that their replacement can vote.
6. As an `OPEN_SLOT` player, join the waiting list **before** any 09:00 ping: the planned game day is visible and joinable from creation.
7. Tick past 09:00 with `confirmedIn` below the minimum → the open-slot group is pinged. Re-tick → **not** pinged again. Separately, with `confirmedIn` already at or above the minimum → no ping, stamp still set.
8. Tick past 13:00 → `VOTING_CLOSED`; waiting-list players promoted in join order up to the gap and **no further**; the open-slot group gets names plus any remaining count. With an empty waiting list, it gets the vacancy count and link instead.
9. An assigned player who has **not** voted shows as *awaiting confirmation*, is **not** in `confirmedIn`, and their slot is **not** re-offered. They then vote IN → they move into `confirmedIn` and no total jumps (the no-double-count check).
10. After the deadline: a structural holder votes OUT → a new vacancy post, and the next waiting-list player is promoted on the same pass. An OUT player tries IN → 400.
11. A waiting-list assignee votes OUT before start − 2h → slot released and re-offered; the same attempt after that instant → 400. A direct claimer's OUT → 400 at any time.
12. Two browsers claim the last remaining slot at once → one succeeds, one gets a clean 400 and no phantom row.
13. Open Game Planner on the day → `confirmedIn` players pre-ticked and the banner lists post-deadline dropouts and unconfirmed assignees. **Assert the pre-tick and the banner separately from the create**, and use a count that is actually legal: `isValidPlayerCount` accepts 4–5, 8–10, 12–15 and 16–20, so a perfectly ordinary confirmed count of **6 or 7 cannot be created at all** — the pre-tick is a seed, not a guarantee of a valid game. Note also that `handleCreateGameDay` filters the selection through `getAvailablePlayersForGame`, which is "today" in **UTC**, so a pre-ticked id can be silently dropped near midnight; assert the selected count against the confirmed count rather than trusting it. Then with a legal count, Create Game Day works and stamps `Game.gameDayId`; a second create against the same game day answers 400. Include a **scoreless** open-slot holder and confirm the existing `BulkScorePanel` gate still blocks — this is the important one: it proves the new entry path cannot leak a scoreless player into the Elo math.
14. **Reconciliation.** With a vote open, create a `SlotReplacement` covering that date: the owner's IN vote disappears, the page turns read-only for them, the replacement can vote, and their waiting-list row is gone. Cancel the window and confirm the owner gets the slot back and can vote IN again — their old vote is **not** restored — and that the replacement can rejoin the waiting list. Repeat with the replacement already `ASSIGNED`, and repeat the cancellation via the admin **approve-cancellation** path and via a **shorten** that moves `endDate` before the game date. Do all of it again with the vote already `VOTING_CLOSED`.
15. **A squad with the vote configured but no open-slot chat id** still promotes its waiting list at the deadline; only the Telegram post is skipped.
16. **After `slotLockAt`**: a structural holder's OUT is recorded but posts nothing and promotes nobody; a waiting-list assignee's OUT is refused; an admin release of an unconfirmed direct claim works and, being past the lock, also posts nothing.
17. **Disable `gameDayOps`** with a vote open → the open row is cancelled and the main group is told, rather than being left to accept votes forever. Then repeat by disabling the squad from `/platform/squads` (`PATCH /api/squads/[squadId]`) and confirm the same thing happens — it is a different handler.
18. **Outage catch-up**: stop the app for a day that contains a candidate date, restart, and confirm the missed game day is still created. Separately, restart after the deadline with an unsent reminder and confirm the reminder is *skipped*, not sent late, while voting still closes.
19. **A failed Telegram send at the deadline** — revoke the open-slot chat id, close voting, restore it — and confirm the next Pass B tick posts the message that was lost, promotes nobody a second time, and then goes quiet. This is the one the previous revision got backwards.
20. **Boundary check:** a signed-in player of squad A hitting squad B's `/game-days/*` routes gets 401/403, and a write body carrying someone else's identity has no effect — **except** `PATCH [date]/admin.ts` with `{ action: 'release', playerId }`, where a squad admin acting on another player is the point of the route.

## `frontend/docs/squad-tenancy.md`

Per the rule in `CLAUDE.md`, the implementation PR updates the living reference in the same change:

- A new **"Game day check-in & attendance vote"** section: the three models, `slotsHeld` vs `confirmedIn` and why they must stay separate, why the status is `VOTING_OPEN`/`VOTING_CLOSED` rather than `OPEN`/`CLOSED` (the 13:00 deadline closes the vote, not the session, which starts hours later), the eligibility predicate and why it resolves against the game date rather than today, the clock rules and where they live, `gameDayOps` with its default-off rationale, the per-squad chat ids, and the new routes.
- **Squad schedule** — rewrite. It is no longer "informational only"; this is the first thing that reads it to *do* something. Add `timezone` to the documented `SquadScheduleData` shape.
- **Auth & access model** — note `requireSquadMember` as the member-level gate, and that the five routes which previously inlined it now use it.
- **Routing** — add `/s/[squad]/game-day/[date]` and the new API routes.
- **Explicitly out of scope so far** — remove "anything reading the recurrence schedule to *do* something (auto-create a `DRAFT` game day, drive the Telegram poll)", since half of that is now built; keep the Telegram-poll half and add this plan's deferred items (retiring the old poll, per-squad bot tokens, multiple playing days per week, per-player notifications).

`frontend/docs/components.md` also needs the "Game-day check-in" entry the mockup branch already drafted, corrected for real data (no mocked votes, no `localStorage`), plus the `UserTabBar` note. And one line in `CLAUDE.md`'s "Core domain flow (game day)": the flow now starts at the vote, two days ahead, not at Game Planner.

## Open questions — resolved in review

All five original questions were answered in the first review pass. Recorded here with their answers rather than deleted, since the reasoning is the useful part:

1. **Per-squad clock times?** **No — they stay constants** in `voteWindow.ts`. Bounding catch-up so a late tick cannot send a reminder after the deadline was judged to matter considerably more than making the times editable, and that bound is now specified in the scheduler section.
2. **May a holder who voted OUT join the waiting list?** **No.** The disjoint-pool rule is load-bearing — it is what makes `slotsHeld` a sum of two non-overlapping terms. The hole worth fixing was never a second way into the queue; it was a replacement window opened *after* voting started, which "Eligibility is live" now handles.
3. **Hiding the roster until you vote?** **Keep it, for voters only.** As written it conflicted with the observer and waiting-list views, since neither ever gets a vote row. It is never shown to a signed-out visitor — that is precisely what makes Decision 1's readable URL acceptable.
4. **Announce cancellations?** **Yes, to the main group**, whenever the game day was already announced. Those people were told to vote and are expecting to play.
5. **Admin reopen?** **Stays out.** What was actually missing on day one is an admin way to **release a single slot** — especially an unconfirmed direct claim, which no other path can free — and that is now in the vote-rules section. The admin "close voting" action goes through the same close-and-sync path as the cron rather than setting the status directly.

Both questions raised by the first review round have since been answered too:

6. **Should a `CANCELLED` game day be recoverable?** **No — cancellation stays terminal.** Removing a `skipDate` produces a brand-new row with an empty vote, and everyone votes again. Un-cancelling would have to invent rules for announcement stamps, for promotions already made, and for votes already discarded; re-creating invents nothing.
7. **Where does reconciliation stop?** **At game days that already exist and are `VOTING_OPEN` or `VOTING_CLOSED`, today's included** — at most `voteOpensDaysBefore` rows. It does not walk the four-month replacement window and never creates a game day in order to reconcile it. Recorded in "Eligibility is live", including why "future only" would have been wrong.

## Still open

Nothing blocking. The two items below are worth a second opinion during implementation rather than before it:

1. **A lost vacancy message is retried, a lost *main-group* message is not.** Announce and remind are stamped when sent, and a failed Telegram call leaves the stamp unset, so Pass B retries them — but with no upper bound on attempts and no backoff. A chat id that has been revoked will retry every five minutes until the deadline passes. That is noisy in the logs rather than harmful, and the alternative (an attempt counter on `GameDay`) is a column for a problem nobody has had yet.
2. **`planVacancySync` runs on every Pass B tick for every open-vote squad.** The `changed` check makes it a cheap no-op, but it is three counting queries per `VOTING_CLOSED` row every five minutes. At current squad counts that is nothing; it is the first thing to look at if the sweep ever gets slow.
