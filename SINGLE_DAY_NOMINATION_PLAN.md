# Single-Day Slot Nomination — Design Plan

**Status:** Proposed. Design only; implementation is a separate follow-up PR.

**Builds on:** `ATTENDANCE_VOTE_PLAN.md` (#210) and its implementation (#211, `feature/attendance-vote`, not yet on `main`). Every file under `lib/gameDay/` named below exists on that branch. This plan should be implemented after #211 merges, not alongside it.

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
- A post to the squad's open-slot Telegram group on create, switch and revoke/void.
- Rejecting a period `SlotReplacement` that would collide with an active nomination.

**Explicitly out of scope:**

- **Any change to the ranking or absentee math** (Decision 6).
- **Nominating after the deadline.** After 13:00 the waiting list owns vacancies. A late hand-off would jump that queue at exactly the moment it is being used.
- **Per-player notifications** (a DM to the nominee). Group messages only, as in the attendance plan.
- **A main-group post.** Only the open-slot group is told (see "Still open").

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

The payoff is that **`slotsHeld` and `confirmedIn` do not change at all.** The slot's one vote row is still the nominator's, cast by the nominator, so `computeGameDayCounts` needs no new term. The double-count traps the attendance plan spent three review rounds on have nothing new to work with. What changes is only *who is shown as attending*: the roster and the planner swap in the nominee wherever the nominator's IN appears.

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

## Decision 4 — open until 13:00, and "13:00" means the instant, not the status

A nomination can be created, switched or revoked while `status === VOTING_OPEN` **and** `now < votesCloseAt`. It can't be done before the game day row exists (two days ahead). A player who wants to arrange something further out has the period replacement.

The explicit time check is needed because **the status lags the deadline by up to one scheduler tick.** `castVote` only checks `status`, so for up to five minutes after 13:00 a vote is still accepted while the row reads `VOTING_OPEN`. For a vote that's harmless. For a nomination it isn't: the user-facing rule is "before 13:00", and a nomination at 13:03 would be written after the deadline pass ought to have run. Checking `votesCloseAt` inside the lock makes the rule exact.

After the deadline the nomination is frozen. It can't be switched or revoked, and it stays attached. The nominator can still vote OUT under the existing structural-holder rules (OUT only from a current IN, and it opens a vacancy until `slotLockAt`). That OUT voids the nomination (Decision 5).

## Decision 5 — every way a nomination ends

A nomination is **active** while `endedAt` is null. The `endedAt`/`endReason` pair follows `SlotReplacement.cancelledAt`: history is kept, and "active" is derived rather than stored as a status.

| Event | Allowed when | Effect on the nomination | Other effects | Open-slot post |
|---|---|---|---|---|
| **Revoke** (nominator plays themselves) | before 13:00 | `REVOKED` | nominator's vote stays **IN** | "Alice is playing in their own slot on Wed — Bob no longer is" |
| **Switch** to another nominee | before 13:00 | old → `SWITCHED`, new row created, one transaction | vote stays IN | one post naming both |
| **Nominator votes OUT** | any time `castVote` allows it | `NOMINATOR_OUT` | the normal OUT; after 13:00 the vacancy sync runs | before 13:00: "Alice's slot on Wed is no longer passed to Bob". After 13:00 the vacancy post covers it. |
| **Admin release** of the nominator | as today | `ADMIN_RELEASE` | as today (vote deleted, sync) | the vacancy post covers it |
| **Nominator or nominee set `DISABLED`** | any time | `PLAYER_DISABLED` | nominee disabled: the nominator's IN is **deleted**, since it was cast on the nominee's behalf. Nominator disabled: as today. The sync runs either way | none (admin action) |
| **Game day cancelled / re-created in place** | as today | `GAME_DAY_RESET` | as today | none; the cancellation post covers it |

**An OUT voids the nomination permanently.** If the nominator flips back to IN before 13:00, *they* are in and the nominee is not. Bringing the nominee back means nominating again. Keeping a voided nomination dormant, so that it silently reactivated on an IN, was considered and rejected: an IN would then mean two different things depending on history the voter can't see on the page.

**When a nomination ends, the nominee rejoins the open-slot pool.** Creating the nomination deleted their `WAITING` row, not `WITHDRAWN` (for the same reason as the attendance plan's reconciliation step 2: `WITHDRAWN` is terminal, and they didn't give a slot back). So they can rejoin the waiting list, **at the back**. Restoring their old `joinedAt` was considered. It would let a nomination act as a queue-hold, which is not what anyone asked for.

**A disabled nominee deletes the nominator's IN, not just the nomination.** Leaving the IN would silently turn "Bob is coming in my slot" into "I am coming", which the nominator never said. Before 13:00 they simply vote again. After 13:00 the slot becomes a vacancy, which matches the situation: the person who was coming no longer is.

## Decision 6 — no ranking change: the nominator keeps their absentee exposure

The absentee sweep is untouched. The nominator didn't play, so they are swept on Path 1 exactly as if they had voted OUT. The nominee is an `OPEN_SLOT` player who either played (ranked normally) or didn't (Path 3, the grace-days path, as for any other open-slot absence).

This is the same answer `OPEN_SLOT_PLAYERS_PLAN.md` gave for a period replacement ("Double liability for one slot"), and it is deliberately kept identical so the two can be revisited **together**. Exempting the one-day nominator alone would make handing off one day safer, ranking-wise, than handing off a period, with no principled reason for the difference. It would also make this feature the first thing in `lib/gameDay/` to reach into `processEncountersForDate`. That decision stays deferred, not rejected, and nothing here makes it harder: "was there an active nomination by me on date D?" is one indexed lookup.

## Decision 7 — a colliding period replacement is rejected, not allowed to win

`createSlotReplacement` gains one guardrail, checked inside its existing transaction after it locks the affected game-day rows:

- the new window's **owner** has an active nomination on any existing game day in the range, or
- the new window's **replacement player** is an active nominee on any existing game day in the range

→ `ValidationError`: *"You have passed your slot for Wed 23 Sep to Bob — revoke that first"* (or the nominee-side wording).

Letting the window win, by voiding the nomination automatically, was the alternative. **Rejected** because the nomination has already been announced to the open-slot group, and a player setting up a four-month arrangement should not silently undo a one-day promise someone else is relying on. The fix is one click, and the error names it.

Only the create path needs this. `approveCancellationRequest` and the shorten path only ever give a slot *back* to an owner, and an owner whose slot was covered can't have held a nomination in the first place (Decision 3).

---

## Data model (`frontend/prisma/schema.prisma`)

One new model and one new enum. No change to `GameDay`, `GameDayVote` or `GameDayOpenSlot` beyond the relation back-reference Prisma requires.

```prisma
enum SlotNominationEndReason {
  REVOKED           // nominator took the slot back before 13:00
  SWITCHED          // replaced by a nomination to someone else
  NOMINATOR_OUT     // nominator voted OUT
  ADMIN_RELEASE     // admin released the nominator's slot
  PLAYER_DISABLED   // nominator or nominee set DISABLED
  GAME_DAY_RESET    // game day cancelled, or re-created in place
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

  // Stamped only after a successful Telegram send (or a deliberate skip), so a failed post is
  // retried by the scheduler - the announcedVacancies rule from the attendance plan.
  announcedAt       DateTime? @map("announced_at")
  endAnnouncedAt    DateTime? @map("end_announced_at")

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

`getOpenSlotPool(squadId, gameDate)` is date-based and has no game day, so it stays as it is. The exclusion lives in `loadGameDayState`, which is what `joinOpenSlot` and every count already go through. `holdingOf` returns a new `'NOMINEE'` holding for an active nominee, and `evaluateVote` rejects it with *"Alice holds the vote for this slot — tell Alice if you can't make it"*.

## Nomination rules: `lib/gameDay/nominations.ts` (new)

All inside `withGameDayLock`, with `ValidationError` for caller error. The acting player always comes from the session.

```ts
nominate(squadId, gameDayId, nominatorId, nomineeId, now)   // create, or switch if one is active
revokeNomination(squadId, gameDayId, nominatorId, now)
endNominationsFor(tx, gameDayId, playerId, reason, now)     // called by castVote(OUT), removePlayerFromGameDay, the reset path
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

`castVote` gains one line: an **OUT** by a player with an active nomination calls `endNominationsFor(…, 'NOMINATOR_OUT')` in the same transaction, before the sync plans. `removePlayerFromGameDay` does the same with `ADMIN_RELEASE` / `PLAYER_DISABLED`, and for a disabled **nominee** it also deletes the nominator's vote (Decision 5). The scheduler's `recreateCancelledGameDay` deletes the game day's nominations with the rest, and `cancelOpenGameDays` ends them `GAME_DAY_RESET`.

## Telegram

Three new pure builders in `lib/gameDay/notifications.ts`, all to **`telegramOpenSlotChatId`**, with the game-day link:

| Message | When |
|---|---|
| "Alice's slot for Wed 23 Sep goes to Bob." | create |
| "Alice's slot for Wed 23 Sep now goes to Carol instead of Bob." | switch |
| "Alice's slot for Wed 23 Sep is no longer passed to Bob." | revoke, or OUT before 13:00 |

Sent **after commit**, stamping `announcedAt` / `endAnnouncedAt` only on success, like `announcedVacancies`. Pass B of the scheduler retries unstamped rows **until `votesCloseAt`**, then stamps them as skipped. A post about a hand-off that arrives after 13:00 is noise, and the vacancy post is the message that matters by then. With no open-slot chat id configured, both stamps are set immediately as skipped.

**Net posts, not every edit.** If a nomination is created and ended before its `announcedAt` send succeeds (a switch within seconds, or a failed first send), the create is stamped skipped and only the net result is posted. The group should never see "passed to Bob" followed by "no longer passed to Bob" for something Bob never saw.

Ends after 13:00 (`NOMINATOR_OUT`, `ADMIN_RELEASE`) and admin/system ends (`PLAYER_DISABLED`, `GAME_DAY_RESET`) are stamped skipped. The vacancy or cancellation post already tells the group what it needs to know.

## API routes

Under `pages/api/squads/[squadId]/game-days/[date]/`, in the house shape (`parseSquadId` → `requireSquadMember` → method dispatch → 405 → `isValidationError ? 400 : 500`):

| Route | Method | Body | Gate |
|---|---|---|---|
| `nomination.ts` | GET — nominees eligible for this game day (the pool minus active nominees), searchable by `?query=` | — | squad member, must be able to nominate |
| " | PUT — create or switch | `{ nomineePlayerId }` | same |
| " | DELETE — revoke | — | same |
| `index.ts` (existing) | GET gains `myNomination`, the nomination received (for a nominee), and `nomineeFor` on roster rows | — | unchanged |
| `admin.ts` (existing) | GET gains the day's nominations, active and ended | — | unchanged |

**The identity rule still holds.** `nomineePlayerId` is the *object* of the action, not the actor. The nominator is always resolved from the session, and a body can't name one. The boundary test gets a new case: a PUT from Bob naming himself as nominee of Alice's slot does nothing, because Bob, as the session player, is not a fulltime holder.

## UI

**`pages/s/[squad]/game-day/[date].tsx`:**

- **A nomination-eligible holder, before 13:00:** a secondary *Pass my slot to…* action below the vote buttons. It opens a search over the GET above and confirms: "Bob will play in your slot. If Bob can't come, vote *I'm out*." With an active nomination, the vote card reads *"Bob is playing in your slot"* with *Change* / *Take it back*, and *I'm out* stays live.
- **The nominee:** no vote buttons and no waiting-list buttons. A card reads *"You're playing in Alice's slot on Wed 23 Sep. Can't make it? Tell Alice."* The roster is shown, since they are not a voter, following the attendance plan's resolved question 3.
- **Roster:** the IN row shows **Bob**, with a small *for Alice* note. Alice doesn't appear separately. This is still one row for one slot.

**`UpcomingSessionsList`** shows the nominee's session as *Playing (Alice's slot)*, so the arrangement is visible from their profile without the link.

**Game Planner** pre-ticks **the nominee in place of the nominator** for every confirmed IN with an active nomination. The banner is unchanged otherwise. The scoreless gate still applies: a scoreless nominee is caught by `BulkScorePanel` as with any open-slot player.

**Admin game-day view** lists the day's nominations, including ended ones with their reason. This is the "tracked separately" record, and it answers the obvious support question ("why was Bob playing?").

## Testing / verification (for the implementation PR)

Against the stateful fake (`lib/gameDay/testing/fakePrisma.ts`), as for the rest of `lib/gameDay/`:

- **`nominations.test.ts`**
  - A fulltime uncovered holder can nominate a pool player. A covered owner, a replacement filler and an open-slot player can't. Eligibility is resolved against **the game date**: a window starting tomorrow blocks a nomination for tomorrow.
  - The nominee must be in the pool. A filler, a `DISABLED` player and a fulltime player are rejected. Two nominators racing for the same nominee leave exactly one active nomination.
  - Nominating sets the nominator's vote to IN from OUT or from no vote, and deletes the nominee's `WAITING` row.
  - A switch ends the old row `SWITCHED` and creates the new one in one transaction. Re-nominating the same person is a no-op.
  - Rejected at `votesCloseAt` **even while `status` is still `VOTING_OPEN`** (the tick-lag regression). Revoke and switch are rejected after 13:00 too.
- **`counts.test.ts`:** a nomination changes **neither** `slotsHeld` nor `confirmedIn`, before or after the deadline.
- **`votes.test.ts`:**
  - The nominee can't vote (the `'NOMINEE'` holding).
  - The nominator's OUT before 13:00 ends the nomination `NOMINATOR_OUT`, and a later IN does **not** bring the nominee back.
  - After 13:00 the nominator's OUT from IN ends it and the vacancy sync promotes the next waiting-list player.
- **`openSlots.test.ts`:**
  - An active nominee can't join the waiting list and is never promoted.
  - After revoke they can rejoin, at the back.
- **`reconcile.test.ts`:**
  - An admin release of the nominator ends the nomination `ADMIN_RELEASE`.
  - A disabled nominee ends it and deletes the nominator's IN.
  - Cancellation and re-create-in-place end or remove nominations.
- **`replacements.test.ts`:** creating a window rejects when the owner has an active nomination in range, and when the replacement player is an active nominee in range. Both are allowed once the nomination is revoked.
- **`notifications.test.ts`:** the three bodies.
- **Scheduler:**
  - An unsent create/end post is retried until `votesCloseAt` and stamped skipped after it.
  - Create-then-revoke before the first send posts nothing.
  - No chat id means immediate skip.
- **Route tests:** the identity case above.
- `characterization.test.ts` and `playingDayCalculator.test.ts` pass unmodified. As before, that proves nothing here, because the ranking math isn't touched.

**End to end** (browser, with the superadmin "run scheduler tick" button):

1. As a fulltime player, pass your slot to an open-slot player who is on the waiting list. The open-slot group gets the post, the waiting-list entry is gone, the roster shows them *for* you, and the counts don't move.
2. As the nominee, open the link: there are no buttons, only the card. Try the vote API directly and get a 400.
3. Switch to another player: one post. Revoke: one post, and the first nominee can rejoin the waiting list.
4. Tick past 13:00. The nomination can no longer be changed, and the planner pre-ticks the nominee instead of you.
5. Vote OUT after the deadline. The nomination ends, the vacancy post goes out, and the next waiting-list player is promoted.
6. Try to create a period replacement covering the date. It is rejected with the revoke-first message.

## `frontend/docs/squad-tenancy.md`

The implementation PR adds a **"Single-day slot nominations"** subsection under "Game day check-in & attendance vote". It covers the model, the vote-stays-with-the-nominator rule and why it leaves the counts untouched, the pool exclusion, the 13:00 instant check, the end reasons, the replacement-collision guardrail, and the new route.

## Still open

Nothing blocking. Worth a second opinion in review:

1. **Main-group visibility.** Only the open-slot group is told, as asked. The main group sees Bob on the roster but gets no post. That's probably right, since it's the open-slot group whose queue was bypassed, but it's a one-line addition if wanted.
2. **Admin void.** There is no admin action to end a nomination directly. An admin can release the nominator (which ends it) or edit the planner on the day. Add a `void-nomination` action to `admin.ts` only if a real case turns up.
3. **Fairness.** A nomination lets a fulltime player choose who plays over the waiting list's first-come order. That is the point of the feature, but it is a policy change the open-slot group should hear about once, outside the app.
