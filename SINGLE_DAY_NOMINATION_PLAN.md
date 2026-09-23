# Single-Day Slot Nomination — Design Plan

**Status:** Proposed. Design only; implementation is a separate follow-up PR.

**Builds on:** `ATTENDANCE_VOTE_PLAN.md` (#210) and its implementation (#211, now on `main`). Every file under `lib/gameDay/` named below is on `main`.

**Revision:** amended after a review pass against the #211 code. The core rule held up: the nominator stays a structural holder, the nominee is kept out of `openSlotPoolIds` and off the waiting list, and `computeGameDayCounts` needs no new term. The gaps were in what "active" means after 13:00, and in two call sites that were named incorrectly:

- **A nomination now ends when its session ends** (`SESSION_ENDED`). Before this, a frozen nomination could never be revoked and never ended, so last week's hand-off would have blocked a new period replacement forever. The collision error says "revoke" only while revoke is still possible.
- **"Rejoin at the back" holds only before 13:00.** After the deadline, a released nominee goes back to the pool, not onto the queue.
- **The Telegram retry is reworked.** It now compares, per nominator, what the group was last told with what is true now. Posting row by row either dropped a still-live hand-off at 13:00 or turned a failed switch into two contradictory posts.
- **The cancel hook moves to `cancelGameDay`**, which is what skip-date cancellation actually runs. `cancelOpenGameDays` is only the disable path. `recreateCancelledGameDay` now deletes nominations along with the votes.
- **The roster swap is placed in `buildRoster`.** The planner's pre-tick comes from `buildRoster`, so a swap made only on the check-in page would still have pre-ticked, and scored, the nominator.
- **Two smaller fixes.** The nominee search masks email addresses like `searchOpenSlotPlayers` does. `joinOpenSlot` gives a nominee the "Alice holds the vote" message instead of the generic "only open-slot players" one.
- **All three "Still open" questions were answered**, and are recorded at the end.

**Scope in one line:** while a game day's vote is open, a fulltime player who still holds their own slot can name one open-slot player to play in it that day. The arrangement is agreed between the two of them beforehand, so the nominee does nothing in the app. The open-slot group is told, and the nomination is kept as its own record.

## Context

Today a fulltime player who can't make one session has two options, and both are wrong for it:

- **Vote OUT.** The slot becomes a vacancy at 13:00, and the waiting list fills it in `joinedAt` order. In practice the player has often already found someone. The club's convention (the old poll's *"Out (slot passed to someone else)"* option) is that they can hand the slot over directly, and the vote has no way to record that.
- **Create a `SlotReplacement`.** That model is built for a period. It requires ≥ 3 playing days (`OPEN_SLOT_PLAYERS_PLAN.md`), puts the replacement on absentee Path 2 (no grace cutoff) for the whole window, and ending it early needs an admin-approved cancellation request. None of that fits "Bob is taking my place on Wednesday".

The attendance vote now gives a game day a real row (`GameDay`) with a real deadline (`votesCloseAt`, 13:00). A one-day hand-off can attach to that row.

**In scope:**

- A `GameDaySlotNomination` record per hand-off, attached to one `GameDay`.
- Create, switch and revoke, by the nominator only, until `votesCloseAt`.
- The nominator's vote carries the slot, and the nominee appears on the roster and in the planner in their place.
- A post to the squad's open-slot Telegram group whenever what the group has been told about a hand-off changes.
- Rejecting a period `SlotReplacement` that would collide with an active nomination.

**Explicitly out of scope:**

- **Any change to the ranking or absentee math** (Decision 6).
- **Nominating after the deadline.** After 13:00 the waiting list owns vacancies. A late hand-off would jump that queue at exactly the moment it is being used.
- **Per-player notifications** (a DM to the nominee). Group messages only, as in the attendance plan.
- **A main-group post.** Only the open-slot group is told. That is the queue the hand-off skips (resolved question 1).
- **An admin action to end a nomination** (resolved question 2).

## Decision 1 — a separate record, not a one-day `SlotReplacement`

`SlotReplacement` with `startDate = endDate = gameDate` looks like the obvious reuse. **Rejected.** Four things that model carries are wrong here:

- **Minimum duration.** The ≥ 3-playing-day rule is part of what a replacement *is*: a guaranteed slot worth being penalised for missing. Waiving it for a special case would turn the rule into a flag.
- **Absentee treatment.** An active window puts the filler on Path 2 of the sweep, with no grace cutoff. A one-day stand-in who misses a session they were never really committed to would take the full ramp.
- **Lifecycle.** Ending a window early goes through `approveCancellationRequest`, which needs an admin. A one-day hand-off must be revocable by the nominator alone, up to 13:00.
- **Eligibility.** A window changes *who holds the slot*, and that drives the whole reconciliation machinery in `reconcile.ts` (vote deleted, reservation inherited, and so on). A one-day nomination deliberately does not change the holder (Decision 2).

Two other shapes were also considered:

- **A `standInPlayerId` column on `GameDayVote`.** This is the smallest possible change. **Rejected** because the vote row is the wrong home for it. Vote rows are deleted by reconciliation and by the admin release, so the history of who played in whose slot would vanish with them. The requirement is that single-day nominations are *tracked separately*.
- **A `GameDayOpenSlot` row with a new `source: NOMINATED`.** **Rejected.** An `ASSIGNED` open slot makes its holder a voter and counts in `slotsHeld`. The nominator's IN already counts that same slot, so this would count one slot twice. It would also give the nominee a vote, which is exactly what Decision 2 rules out.

## Decision 2 — the nominator keeps the vote; the nominee has none

The hand-off is agreed between the two players before anything happens in the app. So the app records the arrangement. It does not ask the nominee to confirm it.

- **Nominating sets the nominator's vote to IN.** "Bob is taking my slot" means the slot is being used.
- **The nominee gets no vote**, no *I'm in* / *I'm out*, and no way to decline in the app. If they can't come, they tell the nominator, and **the nominator votes OUT**.
- **The nominator stays a structural holder.** `classifySlotHolders`, `getStructuralSlotHolders` and `voterIds` are unchanged for them.

The payoff is that **`slotsHeld` and `confirmedIn` do not change at all.** The slot's one vote row is still the nominator's, cast by the nominator, so `computeGameDayCounts` needs no new term. The double-count traps the attendance plan spent three review rounds on have nothing new to work with. What changes is only *who is shown as attending*. `buildRoster` swaps in the nominee wherever the nominator's IN appears (see "Where the swap happens").

The alternative was to move the vote to the nominee, making them a holder for the day with a pre-cast IN. **Rejected** on the product rule rather than on mechanics. It gives the nominee a way to back out that bypasses the person they made the arrangement with, and it reopens the question of what happens to the slot when they do.

## Decision 3 — only a fulltime player's own slot, only to the open-slot pool

| Player, on the game date | May nominate? |
|---|---|
| `FULLTIME`, slot not covered by an active `SlotReplacement` | **yes** |
| `FULLTIME`, slot covered by an active `SlotReplacement` | no — they already gave it away for a period |
| `OPEN_SLOT`, covering an active `SlotReplacement` | no — the slot is borrowed, and sub-letting it would chain hand-offs nobody agreed to |
| `OPEN_SLOT`, assigned an open slot on this game day | no — assignment can't happen before the deadline anyway |

**Nominee:** a member of the game day's open-slot pool (`OPEN_SLOT`, not a filler on that date, not `DISABLED`), and not already an active nominee on the same game day. One person fills one slot.

Both checks resolve against **the game date, not today**, for the same reason Decision 5 of the attendance plan gives. A replacement window starting tomorrow already makes its owner ineligible to nominate for tomorrow's session.

## Decision 4 — open until 13:00, frozen until the session ends

A nomination can be created, switched or revoked while `status === VOTING_OPEN` **and** `now < votesCloseAt`. It can't be done before the game day row exists (two days ahead). A player who wants to arrange something further out has the period replacement.

**"13:00" means the instant, not the status.** The explicit time check is needed because the status lags the deadline by up to one scheduler tick. `castVote` only checks `status`, so for up to five minutes after 13:00 a vote is still accepted while the row reads `VOTING_OPEN`. For a vote that's harmless. For a nomination it isn't: the user-facing rule is "before 13:00", and a nomination at 13:03 would be written after the deadline pass ought to have run. Checking `votesCloseAt` inside the lock makes the rule exact.

**After the deadline the nomination is frozen until the session ends.** It can't be switched or revoked, and it stays active because the planner still needs it that evening. The nominator can still vote OUT under the existing structural-holder rules (OUT only from a current IN, and it opens a vacancy until `slotLockAt`). That OUT voids the nomination (Decision 5).

**A frozen nomination has to end on its own**, or it stays active forever. After 13:00 the only things that can end it are an OUT, a release, a disable or a cancellation, and in the normal case none of those happens. Left active, it would block `createSlotReplacement` (Decision 7) permanently, since a replacement window can start in the past. So a nomination **ends `SESSION_ENDED` once `sessionPhase(gameDay, now) === 'ended'`**. That is the same predicate `view.ts` uses to decide what is "upcoming". It is the normal, successful end: the hand-off ran its course. Where it runs is covered under "Nomination rules".

## Decision 5 — every way a nomination ends

A nomination is **active** while `endedAt` is null. The `endedAt`/`endReason` pair follows `SlotReplacement.cancelledAt`: history is kept, and "active" is derived rather than stored as a status.

| Event | Allowed when | End reason | Other effects |
|---|---|---|---|
| **Revoke** (nominator plays themselves) | before 13:00 | `REVOKED` | nominator's vote stays **IN** |
| **Switch** to another nominee | before 13:00 | old → `SWITCHED`, new row created, one transaction | vote stays IN |
| **Nominator votes OUT** | any time `castVote` allows it | `NOMINATOR_OUT` | the normal OUT; after 13:00 the vacancy sync runs |
| **Admin release** of the nominator | as today | `ADMIN_RELEASE` | as today (vote deleted, sync) |
| **Nominator or nominee set `DISABLED`** | any time | `PLAYER_DISABLED` | nominee disabled: the nominator's IN is **deleted**, since it was cast on the nominee's behalf. Nominator disabled: as today. The sync runs either way |
| **Game day cancelled** (`cancelGameDay`, any path) | as today | `GAME_DAY_CANCELLED` | as today |
| **Session over** | `sessionPhase === 'ended'` | `SESSION_ENDED` | none: the normal end |

A game day **re-created in place** deletes its nominations with its votes and open slots, as the next section describes. By that point they have already been ended `GAME_DAY_CANCELLED`, so the delete only matches the rule that nothing of the old row survives.

What the open-slot group is told about each of these is decided by one comparison, covered under "Telegram". It is not a per-event column.

**An OUT voids the nomination permanently.** If the nominator flips back to IN before 13:00, *they* are in and the nominee is not. Bringing the nominee back means nominating again. Keeping a voided nomination dormant, so that it silently reactivated on an IN, was considered and rejected: an IN would then mean two different things depending on history the voter can't see on the page.

**When a nomination ends early, the nominee goes back to the open-slot pool. What that gets them depends on the time.** Creating the nomination deleted their `WAITING` row, not `WITHDRAWN`, for the same reason as the attendance plan's reconciliation step 2: `WITHDRAWN` is terminal, and they didn't give a slot back. So:

- **Before 13:00** (a revoke, a switch, or an early OUT): they can rejoin the waiting list, **at the back**. Restoring their old `joinedAt` was considered. It would let a nomination act as a queue-hold, which is not what anyone asked for.
- **After 13:00** (an OUT, a release or a disabled nominator): there is no queue to rejoin. `joinOpenSlot` on a closed vote is a **direct claim**, and it succeeds only if a vacancy is still left over **after** the vacancy sync has promoted the waiting list, which runs in the same transaction as the ending OUT. So the nominee is back in the pool and can claim a leftover slot like anyone else. **Nothing recreates a `WAITING` row on a closed vote**, and the implementation must not try to.

**A disabled nominee deletes the nominator's IN, not just the nomination.** Leaving the IN would silently turn "Bob is coming in my slot" into "I am coming", which the nominator never said. Before 13:00 they simply vote again. After 13:00 the slot becomes a vacancy, which matches the situation: the person who was coming no longer is.

## Decision 6 — no ranking change: the nominator keeps their absentee exposure

The absentee sweep is untouched. The nominator didn't play, so they are swept on Path 1 exactly as if they had voted OUT. The nominee is an `OPEN_SLOT` player who either played (ranked normally) or didn't (Path 3, the grace-days path, as for any other open-slot absence).

This is the same answer `OPEN_SLOT_PLAYERS_PLAN.md` gave for a period replacement ("Double liability for one slot"), and it is deliberately kept identical so the two can be revisited **together**. Exempting the one-day nominator alone would make handing off one day safer, ranking-wise, than handing off a period, with no principled reason for the difference. It would also make this feature the first thing in `lib/gameDay/` to reach into `processEncountersForDate`. That decision stays deferred, not rejected, and nothing here makes it harder: "was there a nomination by me on date D, ended `SESSION_ENDED`?" is one indexed lookup.

## Decision 7 — a colliding period replacement is rejected, not allowed to win

`createSlotReplacement` gains one guardrail, checked inside its existing transaction after it locks the affected game-day rows:

- the new window's **owner** has an active nomination on any existing game day in the range, or
- the new window's **replacement player** is an active nominee on any existing game day in the range

→ `ValidationError`. The wording depends on whether the nomination can still be changed:

- **`now < votesCloseAt`:** *"You have passed your slot for Wed 23 Sep to Bob — revoke that first"* (or the nominee-side wording).
- **After it:** *"Your hand-off to Bob is already locked in for Wed 23 Sep"*. Revoke is not possible any more, so the message must not suggest it. The block lasts only until that session ends, when the nomination ends `SESSION_ENDED` (Decision 4) and stops matching.

The active check should also skip nominations whose session has ended but which have not yet been stamped, using the same `sessionPhase` predicate. That way a scheduler outage can't turn a finished hand-off back into a permanent block.

Letting the window win, by voiding the nomination automatically, was the alternative. **Rejected** because the nomination has already been announced to the open-slot group, and a player setting up a four-month arrangement should not silently undo a one-day promise someone else is relying on. Before 13:00 the fix is one click, and the error names it. After 13:00 the hand-off is tonight's, and the planner is about to use it.

Only the create path needs this. `approveCancellationRequest` and the shorten path only ever give a slot *back* to an owner, and an owner whose slot was covered can't have held a nomination in the first place (Decision 3).

---

## Data model (`frontend/prisma/schema.prisma`)

One new model and one new enum. No change to `GameDay`, `GameDayVote` or `GameDayOpenSlot` beyond the relation back-reference Prisma requires.

```prisma
enum SlotNominationEndReason {
  REVOKED             // nominator took the slot back before 13:00
  SWITCHED            // replaced by a nomination to someone else
  NOMINATOR_OUT       // nominator voted OUT
  ADMIN_RELEASE       // admin released the nominator's slot
  PLAYER_DISABLED     // nominator or nominee set DISABLED
  GAME_DAY_CANCELLED  // cancelGameDay, by any path
  SESSION_ENDED       // the normal end - the session is over
}

// A fulltime player passing their slot to an open-slot player for ONE game day
// (SINGLE_DAY_NOMINATION_PLAN.md). Pre-arranged between the two: the nominator keeps the vote,
// the nominee has none. Active = endedAt IS NULL, derived like SlotReplacement.cancelledAt.
// "One active per nominator / per nominee per game day" can't be a MySQL unique index over a
// nullable column, so it is enforced under withGameDayLock, which every write path takes.
model GameDaySlotNomination {
  id                Int       @id @default(autoincrement())
  gameDayId         Int       @map("game_day_id")
  nominatorPlayerId Int       @map("nominator_player_id")
  nomineePlayerId   Int       @map("nominee_player_id")
  createdAt         DateTime  @default(now()) @map("created_at")
  endedAt           DateTime? @map("ended_at")
  endReason         SlotNominationEndReason? @map("end_reason")

  // What the open-slot group has been told - see "Telegram". announcedAt: a post naming this
  // nominee was actually SENT (never set by a skip). retractedAt: the group's picture no longer
  // includes this nominee, whether by a sent post or deliberately settled without one.
  announcedAt       DateTime? @map("announced_at")
  retractedAt       DateTime? @map("retracted_at")

  gameDay   GameDay @relation(fields: [gameDayId], references: [id])
  nominator Player  @relation("SlotNominator", fields: [nominatorPlayerId], references: [id])
  nominee   Player  @relation("SlotNominee", fields: [nomineePlayerId], references: [id])

  @@index([gameDayId, endedAt])
  @@index([nominatorPlayerId])
  @@index([nomineePlayerId])
  @@map("GAME_DAY_SLOT_NOMINATION")
}
```

`GameDay` gains `slotNominations GameDaySlotNomination[]`. `Player` gains `slotNominationsMade` / `slotNominationsReceived`.

A real enum for `endReason`, not a string, for the same reason `playerType` and the game-day enums are: new field, no legacy values.

**Migration:** one additive `CREATE TABLE`, `<YYYYMMDDHHMMSS>_game_day_slot_nomination`, with no backfill. It is generated and drift-checked per `CLAUDE.md`.

## Eligibility: `loadGameDayState` learns about nominees

The structural side is unchanged. The **open-slot pool for a game day** now excludes that day's active nominees:

```
openSlotPoolIds (for this game day) = open-slot pool on gameDate \ {active nominees}
```

Without this, a nominee could join the waiting list, and after 13:00 be promoted into a *second* slot. `GameDayState` gains `activeNominations` (and a `nomineeByNominator` map) so the view, the planner and the vote path all read one consistent set.

`getOpenSlotPool(squadId, gameDate)` is date-based and has no game day, so it stays as it is. The exclusion lives in `loadGameDayState`, which is what `joinOpenSlot` and every count already go through. `holdingOf` returns a new `'NOMINEE'` holding for an active nominee. `evaluateVote` rejects it with *"Alice holds the vote for this slot — tell Alice if you can't make it"*.

**`joinOpenSlot` needs the same message.** Today it answers *"Only open-slot players can join the waiting list"* for anyone missing from `openSlotPoolIds`. A nominee, once removed from the pool, would get that message, which is false: they are an open-slot player. It checks for the `'NOMINEE'` holding before the generic branch and uses the `evaluateVote` wording. `view.ts`'s copy of the same branch (the page's disabled-button reason) changes to match.

## Nomination rules: `lib/gameDay/nominations.ts` (new)

All inside `withGameDayLock`, with `ValidationError` for caller error. The acting player always comes from the session.

```ts
nominate(squadId, gameDayId, nominatorId, nomineeId, now)   // create, or switch if one is active
revokeNomination(squadId, gameDayId, nominatorId, now)
endNominationsFor(tx, gameDayId, playerId, reason, now)     // as nominator or nominee
endAllNominations(tx, gameDayId, reason, now)               // cancelGameDay, session end
```

`nominate`:

1. Game day `VOTING_OPEN` **and** `now < votesCloseAt` (Decision 4).
2. Nominator passes Decision 3 against this game day's state.
3. Nominee is in this game day's open-slot pool and is not an active nominee (under the lock, so two nominators can't both claim Bob).
4. If the nominator already has an active nomination: same nominee → no-op. Different nominee → end it `SWITCHED`.
5. Delete the nominee's `WAITING` open-slot row if there is one. An `ASSIGNED` row can't exist before the deadline.
6. Upsert the nominator's vote to **IN**.
7. Insert the nomination.

No `planVacancySync` is needed: before the deadline it's a no-op, and nothing here changes a count.

**The call sites that end nominations:**

| Caller | Ends | Reason |
|---|---|---|
| `castVote`, on an **OUT** by an active nominator, in the same transaction and **before** `planVacancySync` counts | that nominator's nomination | `NOMINATOR_OUT` |
| `removePlayerFromGameDay` — mode `withdraw` (admin release) / `delete` (disabled) | nominations where the player is nominator **or** nominee. For a nominee, also deletes the nominator's vote (Decision 5) | `ADMIN_RELEASE` / `PLAYER_DISABLED` |
| **`cancelGameDay`** (`lifecycle.ts`), inside its locked transaction | all of the game day's | `GAME_DAY_CANCELLED` |
| `recreateCancelledGameDay` (`scheduler.ts`) | **deletes** the game day's nomination rows, beside its `gameDayVote` / `gameDayOpenSlot` deletes | — |
| the scheduler's session-end step | all of the game day's still-active ones | `SESSION_ENDED` |

**`cancelGameDay` is the hook, not `cancelOpenGameDays`.** Skip-date cancellation, the check-in-off and disabled-squad backstops in Pass A, and the admin `cancel` action all call `cancelGameDay` directly. `cancelOpenGameDays` is only the disable path's loop over it. A nomination ended only from `cancelOpenGameDays` would stay active on a row cancelled by a skip date. And because `recreateCancelledGameDay` refuses to run when a `Game` already exists, that row might never be recreated, so its nominations would sit there active for good.

**The session-end step** runs every tick. It is one query per squad: active nominations whose game day's session has ended, evaluated with `sessionPhase` against the row's own snapshot. They are ended `SESSION_ENDED` under the game day's lock. It goes in its own pass rather than in Pass B, because Pass B only looks at `VOTING_OPEN` rows and `VOTING_CLOSED` rows before `slotLockAt`, and a session ends well after both. Like every pass, it is wrapped per squad.

## Where the swap happens: `buildRoster`

The planner does not have its own attendance list. `getGameDayAttendance` takes `confirmed` from `buildRoster`'s `inPlayers`, and Game Planner seeds `selectedPlayers` from those ids. **So the swap belongs in `buildRoster`, and only there.** A swap made only on the check-in page would still have the planner pre-tick the nominator, and the nominator is who the Elo run would then score.

In `buildRoster`, an IN vote by a nominator with an active nomination adds **the nominee** to `inPlayers`, carrying a `standingInFor: { id, name }` field for the *for Alice* note. The nominator doesn't appear separately. This is still one row for one slot. The check-in page, the planner and the counts all read the same result, so they can't disagree.

The swap applies to the active nomination, and also to one ended `SESSION_ENDED`, so a past game day's roster still shows who actually played. It does not apply to one ended for any other reason, because those mean the nominee isn't coming.

## Telegram

Posts go to **`telegramOpenSlotChatId`** only (resolved question 1), with the game-day link. Three pure builders in `lib/gameDay/notifications.ts`:

| Message | When the sync sends it |
|---|---|
| "Alice's slot for Wed 23 Sep goes to Bob." | the group has been told nothing, and now there is a hand-off |
| "Alice's slot for Wed 23 Sep now goes to Carol instead of Bob." | the group was told Bob, and now it is Carol |
| "Alice's slot for Wed 23 Sep is no longer passed to Bob." | the group was told Bob, and now there is no hand-off |

**The sync compares, per nominator and game day; it does not post row by row.** A switch writes two rows (`SWITCHED` plus the new one) but is one post. Retrying each unstamped row on its own would turn one failed switch into "now goes to Carol instead of Bob" *and* "no longer passed to Bob". So `syncNominationPosts(gameDayId, nominatorId)` looks at that nominator's rows together:

- **Told (K):** the nominee of the one row with `announcedAt` set and `retractedAt` null, or nobody. There is at most one such row, because every post that names a new nominee retracts the previous one in the same stamp.
- **True (T):** the nominee of the active nomination, or of the one ended `SESSION_ENDED`, or nobody.

| K | T | Post | On success, stamp |
|---|---|---|---|
| nobody | nobody | none | every ended row that was never announced: `retractedAt` (settled silently) |
| nobody | Bob | "goes to Bob" | Bob: `announcedAt` |
| Bob | Bob | none | — |
| Bob | Carol | "now goes to Carol instead of Bob" | Bob: `retractedAt`; Carol: `announcedAt` |
| Bob | nobody | "no longer passed to Bob" | Bob: `retractedAt` |

Written that way, the review's cases fall out without special-casing:

- **A create is retried until it is sent or the nomination ends**, with no cutoff at 13:00. A hand-off that is still on is not noise: the nominee's waiting-list row is already gone and the planner will tick them. If the 12:55 send failed, the next tick sends it.
- **Created then revoked before the create was ever sent:** K = T = nobody. Nothing is posted, and the ended row is settled silently.
- **A switch whose post failed, then retried:** if the group had been told Bob, the retry posts "Carol instead of Bob". If the group had been told nothing, the retry posts plain "goes to Carol". It never says "instead of" a name the group never heard.
- **An end after 13:00 whose create was delivered** (an OUT, a release, a disable) is posted like any other end. It usually arrives beside the vacancy post, and that is fine: the group was told Bob was playing, so it should be told Bob no longer is.

**Sync that settles without sending.** Two cases stamp `retractedAt` without a post: an end of reason `GAME_DAY_CANCELLED` (the main-group cancellation post covers the day), and any row still unsettled when the session ends. `SESSION_ENDED` makes T the same nominee as K, so the normal end never posts anything. **`announcedAt` is only ever set by a real send.** That is what keeps K honest.

**When it runs:** after commit, from every write path in the table above (the caller owns the send, as with `planVacancySync`), and on every tick for each nominator with an unsettled row on a non-cancelled game day whose session has not ended. "Unsettled" is derivable and needs no extra column: an active row with `announcedAt` null, or an ended row with `announcedAt` set and `retractedAt` null. With **no open-slot chat id configured**, the sync is a no-op and nothing retries. If a chat id is configured mid-day, a still-live hand-off is then announced, which is correct.

## API routes

Under `pages/api/squads/[squadId]/game-days/[date]/`, in the house shape (`parseSquadId` → `requireSquadMember` → method dispatch → 405 → `isValidationError ? 400 : 500`):

| Route | Method | Body | Gate |
|---|---|---|---|
| `nomination.ts` | GET — nominees eligible for this game day (the pool minus active nominees), searchable by `?query=` | — | squad member, must be able to nominate |
| " | PUT — create or switch | `{ nomineePlayerId }` | same |
| " | DELETE — revoke | — | same |
| `index.ts` (existing) | GET gains `myNomination`, the nomination received (for a nominee), and `standingInFor` on roster rows | — | unchanged |
| `admin.ts` (existing) | GET gains the day's nominations, active and ended | — | unchanged |

**The nominee search returns `{ id, name, maskedEmail }`, exactly like `searchOpenSlotPlayers`** (`lib/replacements.ts`, the period-replacement picker). That picker is the precedent, and this route is open to any squad member, so it must never return a real address. Matching still runs against the real address on the server. The implementation reuses the same `maskEmail` rather than writing a second one. The only difference is the extra filter to this game day's pool.

**The identity rule still holds.** `nomineePlayerId` is the *object* of the action, not the actor. The nominator is always resolved from the session, and a body can't name one. The boundary test gets a new case: a PUT from Bob naming himself as nominee of Alice's slot does nothing, because Bob, as the session player, is not a fulltime holder.

## UI

**`pages/s/[squad]/game-day/[date].tsx`:**

- **A nomination-eligible holder, before 13:00:** a secondary *Pass my slot to…* action below the vote buttons. It opens the masked search above and confirms: "Bob will play in your slot. If Bob can't come, vote *I'm out*." With an active nomination, the vote card reads *"Bob is playing in your slot"* with *Change* / *Take it back*, and *I'm out* stays live. After 13:00, *Change* / *Take it back* are gone and the card says the hand-off is locked in.
- **The nominee:** no vote buttons and no waiting-list buttons. A card reads *"You're playing in Alice's slot on Wed 23 Sep. Can't make it? Tell Alice."* The roster is shown, since they are not a voter, following the attendance plan's resolved question 3.
- **Roster:** straight from `buildRoster`. The IN row shows **Bob** with a small *for Alice* note.

**`UpcomingSessionsList`** shows the nominee's session as *Playing (Alice's slot)*, so the arrangement is visible from their profile without the link.

**Game Planner** needs no change of its own. It pre-ticks whatever `getGameDayAttendance().confirmed` holds, and that already contains the nominee in place of the nominator. The banner is unchanged. The scoreless gate still applies: a scoreless nominee is caught by `BulkScorePanel` as with any open-slot player.

**Admin game-day view** lists the day's nominations, including ended ones with their reason. This is the "tracked separately" record, and it answers the obvious support question ("why was Bob playing?").

## Testing / verification (for the implementation PR)

Against the stateful fake (`lib/gameDay/testing/fakePrisma.ts`), as for the rest of `lib/gameDay/`:

- **`nominations.test.ts`**
  - A fulltime uncovered holder can nominate a pool player. A covered owner, a replacement filler and an open-slot player can't. Eligibility is resolved against **the game date**: a window starting tomorrow blocks a nomination for tomorrow.
  - The nominee must be in the pool. A filler, a `DISABLED` player and a fulltime player are rejected. Two nominators racing for the same nominee leave exactly one active nomination.
  - Nominating sets the nominator's vote to IN from OUT or from no vote, and deletes the nominee's `WAITING` row.
  - A switch ends the old row `SWITCHED` and creates the new one in one transaction. Re-nominating the same person is a no-op.
  - Rejected at `votesCloseAt` **even while `status` is still `VOTING_OPEN`** (the tick-lag regression). Revoke and switch are rejected after 13:00 too.
  - The session-end step ends an active nomination `SESSION_ENDED` once `sessionPhase` is `ended`, and not a minute before.
- **`counts.test.ts`:** a nomination changes **neither** `slotsHeld` nor `confirmedIn`, before or after the deadline.
- **`view.test.ts` (new):**
  - `buildRoster` puts the nominee in `inPlayers` with `standingInFor`, and does not list the nominator.
  - **`getGameDayAttendance().confirmed` contains the nominee id and not the nominator's.** This is the planner/Elo regression.
  - A `SESSION_ENDED` nomination still swaps; a `NOMINATOR_OUT` one doesn't.
- **`votes.test.ts`:**
  - The nominee can't vote (the `'NOMINEE'` holding).
  - The nominator's OUT before 13:00 ends the nomination `NOMINATOR_OUT`, and a later IN does **not** bring the nominee back.
  - After 13:00 the nominator's OUT from IN ends it and the vacancy sync promotes the next waiting-list player.
- **`openSlots.test.ts`:**
  - An active nominee can't join the waiting list, gets the "Alice holds the vote" message rather than "only open-slot players", and is never promoted.
  - After a **pre-deadline** revoke they can rejoin, at the back.
  - After a **post-deadline** OUT, no `WAITING` row is created. Their `joinOpenSlot` is a direct claim that succeeds only if a vacancy remains after the waiting list was promoted, and 400s otherwise.
- **`reconcile.test.ts`:** an admin release of the nominator ends the nomination `ADMIN_RELEASE`. A disabled nominee ends it and deletes the nominator's IN.
- **`lifecycle.test.ts` (new) / `scheduler.test.ts`:**
  - A **skip-date** cancellation through `cancelGameDay` ends nominations `GAME_DAY_CANCELLED` (not only the disable path).
  - `recreateCancelledGameDay` deletes them.
  - A cancelled row with a `Game` (not recreated) is left with no active nomination.
- **`replacements.test.ts`:**
  - Creating a window is rejected when the owner has an active nomination in range, or when the replacement player is an active nominee in range.
  - The message says "revoke" before `votesCloseAt` and "locked in" after it.
  - Both are allowed once the nomination is revoked, **and** once its session has ended, both before and after the session-end step has stamped it (the permanent-block regression).
- **`nominationPosts.test.ts` (new)**, against the K/T table:
  - A create whose send fails at 12:55 is sent on a tick after 13:00.
  - Created then revoked before any send posts nothing and settles.
  - A switch after a delivered create posts "Carol instead of Bob". A switch after an undelivered create posts plain "goes to Carol". Neither ever produces two posts.
  - A post-deadline OUT after a delivered create posts the end.
  - A cancellation and the session end settle without posting.
  - `announcedAt` is never set without a send.
  - No chat id means no posts and no retries.
- **`notifications.test.ts`:** the three bodies.
- **Route tests:** the identity case above, and that the nominee search returns only masked addresses.
- `characterization.test.ts` and `playingDayCalculator.test.ts` pass unmodified. As before, that proves nothing here, because the ranking math isn't touched.

**End to end** (browser, with the superadmin "run scheduler tick" button):

1. As a fulltime player, pass your slot to an open-slot player who is on the waiting list. The open-slot group gets the post, the waiting-list entry is gone, the roster shows them *for* you, and the counts don't move.
2. As the nominee, open the link: there are no buttons, only the card. Try the vote API and the waiting-list API directly: both return 400 with the "Alice holds the vote" message.
3. Switch to another player: one post. Revoke: one post, and the first nominee can rejoin the waiting list.
4. Tick past 13:00. The nomination can no longer be changed, and the planner pre-ticks the nominee instead of you.
5. Vote OUT after the deadline. The nomination ends, the open-slot group is told, the next waiting-list player is promoted, and the former nominee can only direct-claim a leftover slot.
6. Try to create a period replacement covering the date: rejected with "revoke first" before 13:00, and "locked in" after. Tick past the session end and it is accepted.
7. Add a skip date for a game day with a nomination on it: the nomination ends `GAME_DAY_CANCELLED`, and no open-slot post is sent.

## `frontend/docs/squad-tenancy.md`

The implementation PR adds a **"Single-day slot nominations"** subsection under "Game day check-in & attendance vote". It covers:

- the model and its end reasons, including `SESSION_ENDED` as the normal end;
- the vote-stays-with-the-nominator rule, and why it leaves the counts untouched;
- the pool exclusion;
- the 13:00 instant check;
- the swap living in `buildRoster`;
- the K/T post sync;
- the replacement-collision guardrail;
- the new route.

## Open questions — resolved in review

1. **Main-group visibility?** **No: open-slot group only.** That is the queue the hand-off skips, and the main group sees the nominee on the roster anyway.
2. **An admin void action?** **Not for day one.** Ending the nomination when the session ends covers the collision case, and releasing the nominator already voids it earlier. Add one only if a real case turns up.
3. **Fairness of skipping the queue?** **The queue skip is the feature.** One message to the open-slot group, sent by a person outside the app when this ships, is enough.

## Still open

Nothing.
