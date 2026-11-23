# Squad Finances (Cost Sharing & Collection) — Design Plan

**Status:** Draft, for review. Nothing here is implemented yet.

**Scope in one line:** give each squad a **running ledger per player**, fed by a day-after open-slot fee report and a month-end cost split across fulltime players, with money collected through **Tikkie links the treasurer pastes in** and payments **claimed by players and approved by the treasurer** — all announced to the squad's existing Telegram groups.

## Context

Today the squad's money is run by hand. One person (a platform superadmin) pays the court and server costs, another player buys shuttles for **both** squads (but plays in only one), and the monthly total is worked out in a private record and collected via Tikkie. Open-slot players are charged per day they play; that income reduces what fulltime players owe. Every cross-squad correction — e.g. moving the shuttle buyer's positive balance from the squad he doesn't play in to the one he does — is a manual edit.

The app already knows most of what this needs:

- **Who is fulltime vs open-slot** — `Player.playerType` (`OPEN_SLOT_PLAYERS_PLAN.md`).
- **Which open-slot players played on a date, and whether they were covering someone's slot** — `lib/reports/openSlotAttendance.ts` (the `open-slot-attendance` admin page), which already exists "for the squad's cost sharing".
- **Where to post** — `Squad.gameDayOps.telegramMainChatId` / `telegramOpenSlotChatId` (`lib/gameDay/telegram.ts:chatIdFor`) and `Squad.adminTelegramChatId` (`lib/adminNotifications.ts`).
- **A background tick** — the every-5-minutes `node-cron` job in `src/instrumentation.ts`.
- **Every person has an email and a login** — `Player.email` is required, and one email may be a separate `Player` row in more than one squad.

What it doesn't have: any notion of money, a join date on `Player`, or a Telegram handle.

**Why no payment integration.** Tikkie's API is business-only (requires an ABN AMRO business account), and this is a group of friends. So the app is a **ledger with an approval workflow**: it computes what is owed, publishes Tikkie links the treasurer creates by hand in the Tikkie app, and records payments that a player claims and the treasurer confirms. Money never moves through the app.

**In scope:**

- A per-squad, per-player ledger (charges, payments, reimbursements, corrections).
- Squad expenses (court / shuttle / server / other), each with who paid it.
- Day-after open-slot fee report: draft → treasurer edits/approves → Telegram post with a fixed-amount Tikkie link.
- Month-end settlement: expenses − open-slot income − carry-forward, split across a reviewed snapshot of fulltime players, rounded up to €0.50 → Telegram post with an open-amount Tikkie link.
- Payment claims — one claim can cover the claimant, household members, other players, and more than one squad — approved or rejected as a whole.
- Treasurer-entered payments (no claim needed).
- Cross-squad reimbursement for an expense paid by someone who isn't a member of that squad.
- A cross-squad "My finances" page for every signed-in player, and a treasurer workspace.
- A daily 18:00 pending-claims digest to the admin group.
- `Player.createdAt` and `Player.telegramHandle`.

**Explicitly out of scope:**

- **Any payment provider / API** (Tikkie or otherwise). Links are pasted, payments are claimed.
- **Per-squad treasurers.** One platform-level treasurer for now (Decision 1); the data model keeps squads' books separate so this can come later.
- **Reopening a closed month.** Corrections always go into the next open month (Decision 7).
- **Payouts.** A positive balance (credit) just carries forward; there is no "pay the player back in cash" entry type yet.
- **Per-player Telegram DMs.** Group posts with @mentions only — a bot can't DM someone who hasn't started a chat with it, and an @mention needs only the handle.
- **Currency other than EUR.**

## Decisions

### 1. Treasurer = a platform superadmin flagged by env var

A new `TREASURER_EMAILS` env var, parsed exactly like `ALLOWED_ADMIN_EMAILS` (`lib/auth/adminEmails.ts`). A treasurer must **also** be a superadmin — an email in `TREASURER_EMAILS` but not in `ALLOWED_ADMIN_EMAILS` is ignored (and logged once at startup). Changing the treasurer means a redeploy; that's accepted, it rarely changes. Exposed as `session.user.isTreasurer` next to `isSuperAdmin`, with a `requireTreasurer` guard beside `requireSuperAdmin` in `lib/auth.ts`.

Only the treasurer can see squad-wide finances or change anything. Other superadmins and squad admins see only their own balance, like any player. Moving to per-squad treasurers later means replacing this check with a squad-scoped one; the data is already per-squad (Decision 2).

### 2. Books are per squad; the view is per person

Every ledger entry, expense and settlement belongs to **one squad**. A person who plays in two squads has two `Player` rows and therefore two balances — never one merged balance. This keeps each squad's books complete on their own (what it spent, what it collected, what it owes) and is what allows per-squad treasurers later.

The **person-level** view is layered on top: "My finances" finds every `Player` row for the signed-in email and shows each squad's balance plus a combined total, and a single payment claim can carry lines in several squads (Decision 5). One Tikkie payment, one claim, correct books in each squad.

### 3. Running ledger, append-only, integer cents

A player's balance is the sum of their `FinanceEntry` rows in that squad. **Positive = in credit, negative = owes.** Entries are never edited or deleted; a mistake is fixed by a new `ADJUSTMENT` entry with an explanation. All amounts are `Int` euro cents — never floats.

| Entry type | Sign | Created by |
|---|---|---|
| `MONTHLY_SHARE` | − | Month close (Decision 6) |
| `OPEN_SLOT_FEE` | − | Open-slot report approval (Decision 4) |
| `PAYMENT` | + | Claim approval, or treasurer direct entry (Decision 5) |
| `REIMBURSEMENT` | + | Expense paid by a player (Decision 8) |
| `ADJUSTMENT` | ± | Treasurer, with a mandatory note |

A running ledger rather than per-month bills because under/over-payment, late payment, carried-over credit and paying for someone else all fall out of "sum the entries" with no extra rules, and every number on the balance page can be traced to a row.

### 4. Open-slot fee: day-after report, fixed fee, fixed-amount Tikkie

- **Fee:** a fixed amount per squad, a new `Squad.openSlotFeeCents` setting (treasurer-editable). Snapshotted onto each report so a later fee change can't rewrite history.
- **Draft:** the morning after each date that has open-slot players in `getOpenSlotAttendance`, the finance tick creates an `OpenSlotFeeReport` (`DRAFT`) for that squad + date and posts "open-slot report for <date> ready to review" to the squad's admin group. Lines are seeded from the attendance report:
  - *registered and played* and *played without registering* → **ticked**;
  - *registered but not played* → listed, **unticked** (the treasurer decides on no-shows);
  - anyone **covering a fulltime slot** (a `SlotReplacement` or one-day nomination that date) → listed, **unticked**, with the reason. A replacement plays on the fulltime player's monthly share and pays nothing (settled in discussion).
  The attendance classifier currently reports coverage only as free-text `notes`; it gains a structured `coveringSlot: boolean` so the draft doesn't parse strings.
- **Review:** the treasurer ticks/unticks, can add any squad player by hand, pastes the Tikkie link (**required to approve**), and approves.
- **Approve** (one transaction): status → `APPROVED`, one `OPEN_SLOT_FEE` entry per ticked line, each stamped with the finance month (Decision 7). Then the bot posts to the **open-slot group** (`chatIdFor(squad, 'openSlot')`): date, fee, the list of names (as `@handle` where set), the Tikkie link, and a link to "My finances". A failed post is retryable from the report page; it doesn't undo the approval.
- **Income counts at approval, paid or not.** The month-end calculation uses the sum of approved `OPEN_SLOT_FEE` charges in that month, not what has been collected. If an open-slot player never pays, the debt stays on their balance and the treasurer can write it off with an `ADJUSTMENT`.
- A date with no open-slot players gets no report. The treasurer can also create a report for any past date by hand (e.g. a squad without check-in).

### 5. Payment claims: split lines, all-or-nothing approval

A **claim** is "I paid €X on <date>, covering these players":

- **Lines:** each is `(squad, player, amountCents)`, and the lines must sum to the total. The form is pre-filled with the claimant's own outstanding balance in every squad they play in, plus the outstanding balance of each **household member** (Decision 9). The claimant can edit amounts, remove lines, and add **any** player from any squad they're a member of — for an ad-hoc "I paid for X too", they type the amount (they can't see X's balance).
- **Status:** `PENDING → APPROVED | REJECTED`, or `WITHDRAWN` by the claimant while pending. A pending claim has **no effect on balances**; "My finances" shows it as "awaiting confirmation".
- **Approval is all-or-nothing.** The treasurer sees the full breakdown and either approves (one `PAYMENT` entry per line, in each line's squad, in one transaction) or rejects with an optional reason. Partial approval is deliberately not offered — rejecting lets the claimant resubmit a corrected claim, which is simpler than half-applied claims.
- **Treasurer direct entry:** the same form, used by the treasurer on anyone's behalf (e.g. a cash payment, or someone who didn't mark it). It is created already `APPROVED`, with `source = TREASURER`, so the history reads the same either way.
- **Digest:** at 18:00 Europe/Amsterdam, if any claims are pending, one message to the admin group of each squad that has a pending claim line: "N payment claims waiting for review (€total)" + link to the treasurer queue. Nothing on quiet days; no per-claim pings.

### 6. Month-end settlement: reviewed snapshot, rounded up to €0.50

The treasurer closes a squad's month from a settlement page:

1. **Expenses** for that month are listed (Decision 8) and can be added from the same page.
2. **Members snapshot:** every `FULLTIME` player in the squad — **including inactive ones** (a fulltime slot is held whether or not its holder plays, same premise as `Squad.maxPlayers`) — pre-ticked, **except** players whose `createdAt` falls in that month (**first month free**). A player who left mid-month still owes the full month; the treasurer unticks someone only from the month *after* they left. Little roster movement is expected, so a reviewed snapshot beats a membership-history table.
3. **Live calculation**, recomputed as boxes are ticked:

   ```
   net        = expenses − openSlotIncome − carryForwardIn
   share      = ceilToHalfEuro(max(net, 0) / members)      // 15.30 → 15.50, 15.70 → 16.00
   carryOut   = share × members − net                       // ≥ 0; the rounding surplus, or the whole surplus if net < 0
   ```

   `openSlotIncome` = approved `OPEN_SLOT_FEE` charges stamped with this month. `carryForwardIn` = the previous closed month's `carryOut` (0 for the first). Closing requires at least one member.
4. **Close** (one transaction, refused if the month is already closed or the previous month is still open): store the snapshot + figures on `FinanceMonth`, create one `MONTHLY_SHARE` entry per ticked member, status → `CLOSED`.
5. **Announce:** the treasurer pastes an **open-amount** Tikkie link (required to close) and the bot posts to the **main group** (`chatIdFor(squad, 'main')`): month, total cost, per-person share, the Tikkie link, and a link to "My finances" ("pay what your balance shows"). Open amount because balances differ once credit and arrears carry over.

**Carry-forward is a squad-level figure, not a player ledger entry** — it reduces next month's cost for everyone, and it lives on `FinanceMonth`, so the player ledger stays "what you personally owe".

### 7. Months close in order and never reopen

A squad's `FinanceMonth` rows are closed in calendar order. Anything dated into a **closed** month — a late open-slot report, a late expense — is stamped with the **next open month** instead (the earliest month after it that isn't closed). The original date is kept on the row; only the finance month moves. This is what "a late report counts in next month's open-slot income" means.

There is no reopen. A wrong figure is corrected in the next open month: a squad-level correction as an expense with category `OTHER` and an explanation (which may be negative), or a per-player correction as an `ADJUSTMENT` entry.

### 8. Expenses and who paid them

`FinanceExpense`: squad, date, category (`COURT | SHUTTLE | SERVER | OTHER`), amount, description, and **paid by**:

- **Treasurer** (default) — no ledger effect. The treasurer's own money is the squad's funds.
- **A player** — that player gets a `REIMBURSEMENT` credit for the full amount, created with the expense. If it exceeds what they owe, their balance goes positive and carries forward.

**Cross-squad payer.** The shuttle buyer pays for squad B's shuttles but is only a member of squad A. When the payer chosen for a squad-B expense is a person (picked by email from all squads) with no `Player` row in B, the treasurer picks which of their squads to credit, and the expense records `creditedSquadId = A`, `creditedPlayerId`. The `REIMBURSEMENT` entry lands in squad A's ledger pointing back at the squad-B expense.

That automates today's manual transfer while keeping each squad's books whole: squad B's books show the cost (and that it was settled via A); squad A's ledger shows the credit. The inter-squad position ("B's costs that A's ledger paid for") is derivable from expenses whose `creditedSquadId ≠ squadId`, so no separate transfer table is needed. A purchase that covers both squads is entered as two expenses, split however they agreed.

### 9. Visibility: own balance + household

Players see only their **own** balance and history, plus those of their **household** members.

- A `FinancePayerLink` says "`payerEmail` pays for `memberEmail`". It's email-level, so it covers every squad both people are in. Created and removed by the treasurer only. It's one-directional and may be many-to-one (a parent paying for two players).
- The payer sees each household member's balance in "My finances" and gets their balances pre-filled on claims. The member doesn't see the payer's balance.
- Ad-hoc paying for someone outside your household is still possible (Decision 5), but blind: you enter the amount you paid.
- The treasurer sees everything, including a full squad balance sheet.

A fully open balance sheet was considered (everyone sees everyone) because people pay for each other; households cover the regular cases while keeping balances private, and an "open books" squad setting can be added later if a squad wants it.

### 10. Telegram handle and join date on `Player`

- **`telegramHandle`** (nullable `VARCHAR(32)`, stored without the `@`, validated against Telegram's username rules: 5–32 chars, `[A-Za-z0-9_]`). Editable by the player on `/s/[squad]/user/profile` and by squad admins on the players page. Since it's a property of the person, saving it on one squad's profile updates **every** `Player` row with that email. Used only for @mentions in group posts; players without one are listed by name.
- **`createdAt`** (nullable `DATETIME`, `DEFAULT CURRENT_TIMESTAMP` for new rows). **Not backfilled**: existing players stay `NULL`, which the snapshot treats as "not new" — correct, since they all predate the feature. Used only by Decision 6's first-month-free default.

## Data model

All new tables carry `squadId` where they belong to a squad, map to `UPPER_SNAKE` table names like the rest of the schema, and come in one additive migration.

```prisma
enum FinanceEntryType { MONTHLY_SHARE OPEN_SLOT_FEE PAYMENT REIMBURSEMENT ADJUSTMENT }
enum ExpenseCategory  { COURT SHUTTLE SERVER OTHER }
enum FinanceMonthStatus { OPEN CLOSED }
enum OpenSlotReportStatus { DRAFT APPROVED }
enum PaymentClaimStatus { PENDING APPROVED REJECTED WITHDRAWN }
enum PaymentClaimSource { PLAYER TREASURER }

model FinanceMonth {            // one per squad per month, created lazily when first needed
  id               Int
  squadId          Int
  month            DateTime @db.Date      // first of the month
  status           FinanceMonthStatus @default(OPEN)
  // Snapshot at close (all cents):
  expensesCents         Int?
  openSlotIncomeCents   Int?
  carryForwardInCents   Int?
  memberCount           Int?
  shareCents            Int?
  carryForwardOutCents  Int?
  tikkieUrl        String?
  closedAt         DateTime?
  closedByEmail    String?
  announcedAt      DateTime?              // null after a failed post → retry button
  members          FinanceMonthMember[]
  @@unique([squadId, month])
}

model FinanceMonthMember { id Int; financeMonthId Int; playerId Int; @@unique([financeMonthId, playerId]) }

model FinanceExpense {
  id               Int
  squadId          Int
  financeMonthId   Int                    // Decision 7: next open month if its date's month is closed
  incurredOn       DateTime @db.Date
  category         ExpenseCategory
  amountCents      Int                    // may be negative only for an OTHER correction
  description      String
  paidByEmail      String?                // null = treasurer
  creditedSquadId  Int?                   // squad whose ledger got the reimbursement (≠ squadId when cross-squad)
  creditedPlayerId Int?
  createdByEmail   String
  createdAt        DateTime
}

model OpenSlotFeeReport {
  id             Int
  squadId        Int
  gameDate       DateTime @db.Date
  feeCents       Int                      // snapshot of Squad.openSlotFeeCents
  status         OpenSlotReportStatus @default(DRAFT)
  tikkieUrl      String?
  approvedAt     DateTime?
  approvedByEmail String?
  announcedAt    DateTime?
  lines          OpenSlotFeeReportLine[]
  @@unique([squadId, gameDate])
}

model OpenSlotFeeReportLine {
  id        Int
  reportId  Int
  playerId  Int
  included  Boolean
  reason    String?                       // "registered, not played", "covering X's slot", "added by treasurer"
  @@unique([reportId, playerId])
}

model PaymentClaim {
  id              Int
  claimantEmail   String                  // who paid (person, not squad-scoped)
  paidOn          DateTime @db.Date
  totalCents      Int
  note            String?
  source          PaymentClaimSource
  status          PaymentClaimStatus @default(PENDING)
  reviewedByEmail String?
  reviewedAt      DateTime?
  rejectReason    String?
  createdAt       DateTime
  lines           PaymentClaimLine[]
}

model PaymentClaimLine { id Int; claimId Int; squadId Int; playerId Int; amountCents Int }

model FinanceEntry {
  id              Int
  squadId         Int
  playerId        Int
  type            FinanceEntryType
  amountCents     Int                     // signed: + credit, − charge
  financeMonthId  Int
  note            String?                 // required for ADJUSTMENT
  // Exactly one source reference, by type:
  financeMonthMemberId Int?               // MONTHLY_SHARE
  openSlotReportLineId Int?               // OPEN_SLOT_FEE
  paymentClaimLineId   Int?               // PAYMENT
  expenseId            Int?               // REIMBURSEMENT
  createdByEmail  String
  createdAt       DateTime
  @@index([squadId, playerId])
  @@index([financeMonthId, type])
}

model FinancePayerLink { id Int; payerEmail String; memberEmail String; createdByEmail String; createdAt DateTime; @@unique([payerEmail, memberEmail]) }
```

Plus `Squad.openSlotFeeCents Int?` (null = open-slot fees not used in this squad), `Player.telegramHandle`, `Player.createdAt`.

The source-reference columns get **unique** indexes (e.g. one `FinanceEntry` per `openSlotReportLineId`), so a double-submitted approval can't double-charge — the same idempotency-by-constraint approach the game-day tables use.

## Pages and routes

**Player** (any signed-in user, not squad-scoped):

| Route | What |
|---|---|
| `/finances` | Per-squad balance cards + combined total, household members' cards, ledger history per squad, pending/rejected claims, "I've paid" button |
| `/finances/claim` | Claim form (pre-filled lines, add player, split) |
| `GET /api/finances/me` · `POST /api/finances/claims` · `POST /api/finances/claims/[id]/withdraw` | |

**Treasurer** (`requireTreasurer`; linked from `/platform/squads` and shown in the nav only for the treasurer):

| Route | What |
|---|---|
| `/platform/finance` | Squad switcher; pending-claims queue (across squads); open-slot reports to review; current open month per squad |
| `/platform/finance/[squadId]/months/[month]` | Settlement: expenses, members snapshot with live calc, Tikkie link, close + announce |
| `/platform/finance/[squadId]/open-slot/[date]` | Open-slot report review, Tikkie link, approve + post |
| `/platform/finance/[squadId]/ledger` | Squad balance sheet: every player's balance, drill into entries, add adjustment / direct payment |
| `/platform/finance/households` | Manage payer links |
| `/api/platform/finance/**` | The corresponding endpoints |

The money calculations (`ceilToHalfEuro`, the settlement formula, finance-month resolution, claim pre-fill, draft-line seeding) live in a pure `lib/finance/` module with unit tests, separate from the Prisma paths — the same split as `lib/gameDay/`.

**Scheduler:** a `runFinanceTick()` added to the existing 5-minute cron in `instrumentation.ts`, guarded by stamps (never "now == threshold"), so a missed tick catches up:
- Draft open-slot reports for each squad's past dates (from the morning after, squad-local) that have open-slot players and no report yet — looking back a bounded window (e.g. 14 days) so turning the feature on doesn't flood the admin group with old dates.
- The 18:00 pending-claims digest, once per day (stamped).

## Docs to update in the implementation PR

- `frontend/docs/squad-tenancy.md` — a new "Finances" section (per-squad books, treasurer role, new `Squad`/`Player` fields, Telegram posts), per `CLAUDE.md`.
- `CLAUDE.md` — a "Where things live" bullet for `lib/finance/` and the `TREASURER_EMAILS` env var.
- `.env.example` / deployment env — `TREASURER_EMAILS`.

## Suggested build order

1. **Foundations:** migration (all tables + `Player` fields + `Squad.openSlotFeeCents`), `TREASURER_EMAILS` / `requireTreasurer`, Telegram handle on profile + players page.
2. **Ledger + expenses + month close** (with treasurer direct payments) — usable on its own, replacing the private record.
3. **"My finances" + payment claims + approval queue + 18:00 digest.**
4. **Open-slot reports** (scheduler draft, review, Telegram post).
5. **Households and cross-squad reimbursements.**

Each step is shippable on its own; the treasurer can enter open-slot fees as adjustments until step 4 lands.

## Open questions

1. **Opening balances.** People already carry balances in the current manual record. Proposal: on go-live, the treasurer enters one `ADJUSTMENT` per player ("opening balance as of <date>") and the first in-app month's `carryForwardIn` is set by hand on the first settlement. OK?
2. **First in-app month.** Which month is the first one settled in the app? Months before it are never created.
3. **Open-slot report timing.** Draft "the morning after" — is 09:00 squad-local fine, or should it wait until the day's `Game` is processed (so encounters are final)?
4. **Admin-group posts.** The draft-ready ping and the digest go to each squad's `adminTelegramChatId`. Is the treasurer in both squads' admin groups, or should finance posts go to a single treasurer chat (a new `TREASURER_TELEGRAM_CHAT_ID` env var)?

**Resolved while drafting:** leaving players. Nothing in the app deletes a `Player` row (leaving is a status change), so someone who left keeps their login and their "My finances" balance until it's settled. Finance tables reference `Player` with ordinary foreign keys, so a future delete path would have to deal with existing ledger rows first.
