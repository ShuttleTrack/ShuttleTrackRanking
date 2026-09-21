# Player Self-Registration & Squad Join Requests — Design Plan

**Status:** Proposed — not implemented. This document is up for review; the implementation follows in a separate PR once the decisions below are agreed. Same shape as `OPEN_SLOT_PLAYERS_PLAN.md` (PR #198, approved before its implementation PR #203).

**Revision:** amended after a review pass. Two substantive changes and a set of gap-fixes. **Decision 2 is reversed** — squad openness is now its own `Squad.openForOpenSlot` field defaulting to `false`, not a second meaning bolted onto `isPublic`. The rest of the amendments close holes the first draft left in the caller-facing flow (`/squads` already redirects one-squad members past the page the draft put pending-request UI on; "Find a squad" needed to be in both of `SquadSwitcherLinks`' two trees; a pending request on a squad that later closes had no surface left to appear on) and on the write path (the create/withdraw signatures invited trusting a body-supplied email; approving a request whose player already exists left a permanently-`PENDING` row; `maxPlayers` was only checked at approve, never at request; the approve path never re-validated the name). One review point was checked and **rejected** — see "A rejected review point" at the end.

**Scope in one line:** let a person sign in without belonging to any squad, browse the squads that are open to open-slot registration, and request to join one — and let a squad admin approve or reject those requests from the admin roster, optionally setting a starting score while approving.

## Context

Getting onto a roster today is entirely an admin action. A squad admin opens `/s/[squad]/admin/players`, types a name and email, and `addPlayer` (`frontend/src/lib/ranking/players.ts`) creates the `Player` row. There is no way for a player to initiate that, and no way for anyone to discover which squads exist and are taking people.

Worse, a prospective member **cannot even sign in**. `validateUserAccessLocal` (`frontend/src/lib/auth/validateUserAccess.ts`) verifies the Google ID token and then calls `isKnownToAnySquad`; an email that is not already a `SquadAdmin` or a `Player` somewhere gets `isAllowed: false`, NextAuth's `signIn` callback returns `false`, and the person lands back on `/login` with a generic error and no explanation. "Sign in first, then ask to join" is not currently expressible.

Both `frontend/docs/squad-tenancy.md` and `OPEN_SLOT_PLAYERS_PLAN.md` list the public "browse squads / request to join as open-slot" flow under *explicitly out of scope so far*. This plan is that work.

**In scope:**

- A signed-in session that belongs to zero squads becomes a real, supported state.
- A per-squad opt-in flag for accepting registrations, off by default.
- A directory of open squads, reachable from the account menu, for newcomers *and* for existing members looking for a second squad; plus a request CTA on the squad's own public board, which is where a newcomer following a shared link actually lands.
- A `SquadJoinRequest` record with an admin approve/reject decision, where approving creates the `Player` row.

**Explicitly out of scope** (called out here so the follow-up PR isn't expected to carry them):

- **Notifying a requester of the decision.** There is no per-user notification channel — `lib/telegram/` is a single global group poll, and no transactional email is configured. The requester sees the state on `/squads/browse`. Adding a channel is its own piece of work.
- **Rate limiting beyond one pending request per squad per email.** Anyone with a Google account can now sign in, so a determined person can create requests across every open squad. Each one still costs an admin a single click to reject. If this turns into real spam, the answer is a rate limit or an invite code, not a narrower sign-in gate.
- **Squad-side invitations** (an admin sending someone a link). This is the pull direction only.
- **A self-service starting score.** The admin sets it, or leaves it unset; nothing about an approved player's rank is self-declared.
- **A waitlist for a full squad.** A squad at `maxPlayers` shows a disabled "Squad is full" CTA — see Decision 3.

---

## Decision 1 — no profile / user table

The prompt for this work raised the option of a profile entity linking a person's several `Player` rows (one per squad) into one identity, possibly moving `email` onto it. **Rejected — email stays the identity key.**

The app already treats a Google-verified email as *the* identity, uniformly and deliberately:

- `SquadAdmin` is keyed `(squadId, email)`, with an explicit note in `schema.prisma` that this is by email "not a numeric user id, matching how this app already resolves identity".
- `Player` is keyed `@@unique([squadId, email])`, and `Player.email` was made **required** by the tenancy migration precisely because "email is the only link between a login and a role in a squad".
- `SlotReplacement.createdByEmail` records authorship the same way.
- `getSquadAccess(email, squadId)` resolves standing per request, per squad, and is never cached on the session.

A `UserProfile` table would sit alongside all of that rather than replacing it. Auth would still resolve by email (the ID token has no profile id), `getSquadAccess` would still key by email, and the ranking layer never touches identity at all. What the profile row would actually add is a display name and avatar for a person with zero squads — and a join request can simply carry the requester's name itself, which it needs to do anyway since the admin may edit it before creating the player.

So the profile table's cost (a new table, a nullable `Player.profileId` backfilled by email, a second identity concept two layers of code have to agree on, plus the "which profile is canonical if two Google accounts share a person" question that has no answer) buys nothing this feature needs.

**This is not a one-way door.** A `UserProfile` keyed on `email @unique` can be added later as a pure lookup table — cross-squad display name, avatar, notification preferences — without touching `Player`, auth, or any query in `lib/ranking/`. Nothing in this plan makes that harder.

## Decision 2 — a new `Squad.openForOpenSlot` flag, default `false`

A squad is listed in the directory, and will accept join requests, iff `enabled && openForOpenSlot`.

```prisma
// Whether this squad accepts self-service open-slot join requests (SELF_REGISTRATION_PLAN.md).
// Deliberately NOT folded into isPublic: that flag answers "does this squad's board feed the
// site-root aggregate leaderboard", which is a display question, not a recruiting one. A squad
// wanting a public board and a closed roster is a real configuration and must stay expressible.
// Default false so no existing squad starts receiving requests without its admin opting in.
openForOpenSlot Boolean @default(false) @map("open_for_open_slot")
```

The first draft reused `isPublic` to avoid a column and one more setting. That was reversed on review. The two flags answer genuinely different questions, and conflating them makes "public board, closed roster" inexpressible while silently changing what an existing toggle does — a toggle quietly gaining a second effect was the main risk that draft carried. They are independent: a **private** squad may be open for registration (reachable by link, not on the aggregate board, still recruiting), and a **public** squad may be closed.

`false` by default means nothing changes on deploy until an admin opts in, and the migration stays a plain additive column with a default — no backfill, no staged nullable-then-tighten.

The name matches the `openSlot*` cluster already on `Squad` (`openSlotAbsenteeGraceDays`, `openSlotVisibilityGameDays`) and says what it gates: open-slot registration, which is what Decision 3 makes an approval produce.

**Settings surface:** the toggle belongs in the existing **"Open-slot players"** section of `/s/[squad]/admin/settings.tsx`, alongside the two open-slot window settings, and rides the existing `PATCH /api/squads/[squadId]/open-slot-settings` route rather than adding a fourth single-field endpoint. It needs its own confirmation copy explaining that turning it on lists the squad publicly and starts accepting requests — the lesson from `visibilityConfirmCopy()`, which is the string an admin actually reads before flipping a switch.

Because `isPublic` is untouched, its existing copy — the settings section text **and** `visibilityConfirmCopy()` at `settings.tsx:32` — needs no change.

## Decision 3 — approval creates an `OPEN_SLOT` player, score optional

The approve action defaults to `playerType: OPEN_SLOT` with no starting score, and the admin may override to `FULLTIME` (which, unchanged, requires a score > 0) or type a starting score for either.

This falls out of the guardrails `OPEN_SLOT_PLAYERS_PLAN.md` already built, with no new special cases:

- `Player.rankScore` is nullable and an `OPEN_SLOT` player may legitimately have none.
- A scoreless player lands in the admin roster's **"Not Yet Played"** list (`?status=enabled`) flagged "Needs a score" via `PlayerInfo.hasScore`.
- They stay selectable in the game planner, but the existing bulk-assign-score panel **blocks "Create Game Day"** while any selected player is scoreless, and the server-side gate in `POST/PUT /api/squads/[squadId]/games` rejects such a group with a 400 regardless of the UI.
- `applyAbsenteeDeductions` skips a scoreless player and `calculateAndPersistElo` throws on one, as a second line of defence.

So an approved-but-unscored self-registrant is already a safe state that the ranking math cannot reach. The admin can decide the starting score when it matters — at the first game day — rather than being forced to invent one at approval time.

### `maxPlayers` interacts with this more than the first draft admitted

**Open-slot players are not free of the roster cap.** Both `addPlayer`'s cap check and the `playerCount` on `GET /api/squads/[squadId]` are `prisma.player.count({ where: { squadId } })` — every row, including `OPEN_SLOT` and disabled ones. So every approval consumes a slot.

Consequences the implementation must handle, none of which the first draft covered:

- **The cap is checked at request time, not only at approve.** `createJoinRequest` rejects when the squad is already at `maxPlayers`, and the browse card renders a **disabled "Squad is full"** CTA rather than inviting a request that can only ever be refused. No waitlist (see out-of-scope).
- **A squad at its cap cannot approve anyone, and its own admin cannot unblock it** — `maxPlayers` is superadmin-only editable. The approve modal must say that explicitly rather than surfacing a bare failure.

**Settled on review: the cap stays exactly as it is.** An `OPEN_SLOT` player counts against `maxPlayers` like any other, and `maxPlayers` stays superadmin-only editable. A squad admin who needs more room asks a platform superadmin to raise it — the same path that already exists, and an acceptable one at these group sizes given raising a roster cap is a rare, deliberate act rather than day-to-day squad management.

So no permission or counting change is in scope. What this does mean is that the two places a full squad surfaces — the disabled "Squad is full" browse CTA, and the approve modal — carry the *whole* explanation, including that a superadmin can raise the cap. Those strings are the entire mitigation for this, so they need to say who to ask, not just "full".

---

## Data model (`frontend/prisma/schema.prisma`)

One new model, one new enum, one new `Squad` column. **No change to `Player`, `Encounter`, `ScoreHistory`, or `Game`.**

```prisma
enum JoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
  WITHDRAWN
}

model SquadJoinRequest {
  id              Int               @id @default(autoincrement())
  squadId         Int               @map("squad_id")
  // Identity key, lowercased on write - same convention as SquadAdmin.email and Player.email.
  // ALWAYS taken from the verified session, never from a request body - see "Whose email".
  email           String            @db.VarChar(255)
  // VarChar(32) deliberately matches Player.name: this string becomes that one on approval,
  // so validating it here means the approval insert can't fail on length.
  name            String            @db.VarChar(32)
  message         String?           @db.VarChar(500)
  status          JoinRequestStatus @default(PENDING)
  createdAt       DateTime          @default(now()) @map("created_at")
  decidedAt       DateTime?         @map("decided_at")
  decidedByEmail  String?           @map("decided_by_email")
  // The Player row this request resolved to. Not an FK relation - it's an audit breadcrumb,
  // and a deleted player shouldn't block reading the request history.
  createdPlayerId Int?              @map("created_player_id")

  squad Squad @relation(fields: [squadId], references: [id])

  @@index([squadId, status])
  @@index([email])
  @@map("SQUAD_JOIN_REQUEST")
}
```

Plus `joinRequests SquadJoinRequest[]` and the `openForOpenSlot` field from Decision 2 on `Squad`.

**Decided rows are kept, never deleted.** `APPROVED` / `REJECTED` / `WITHDRAWN` rows are the audit trail for "why is this person on the roster" and "did we already turn them down", and keeping them is what lets someone re-request after a rejection without a partial-unique-index problem.

**No unique constraint enforcing "at most one `PENDING` per `(squadId, email)`."** MySQL has no partial/filtered unique index, so that rule cannot be a constraint. This is exactly the situation `SlotReplacement` is already in — `schema.prisma` notes that "MySQL can't express 'no overlapping ranges' as a constraint; the overlap check has to happen application-side inside the same transaction as the insert" — and this plan follows that precedent rather than inventing a second pattern: check-then-insert inside one `prisma.$transaction`.

**Migration.** Additive `CREATE TABLE` plus an `ADD COLUMN` with a default; no backfill, no nullable-then-tighten staging. Per `CLAUDE.md`, generate the SQL with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (with a `--shadow-database-url`), check it in as `frontend/prisma/migrations/<YYYYMMDDHHMMSS>_squad_join_requests/migration.sql`, apply with `node scripts/prisma-migrate-deploy.mjs`, and confirm zero drift with the `migrate diff --exit-code` check.

## Opening sign-in

`validateUserAccessLocal` drops the `isKnownToAnySquad` gate: a Google ID token that verifies, with `emailVerified`, is enough. `AuthResponse` keeps its shape (`isAllowed` stays, and is simply always `true` when the token verifies), so NextAuth's `signIn` and `session` callbacks need no change. `isKnownToAnySquad` itself becomes unused and is removed from `lib/auth/squadAccess.ts`; `validateUserAccess.test.ts`'s "unknown email is denied" cases invert.

That gate is the app's only current membership check at the door, so removing it deserves a proper argument rather than an assertion. **The claim is that it was never load-bearing**, because every real boundary re-resolves membership per request and none of them consult it:

- `middleware.ts` matches only `/s/:squad/admin/*`, `/s/:squad/user/*` and `/platform/*`, and its `authorized` callback is `!!token` — "signed in at all", nothing more. Its own comment already says the real boundary is elsewhere.
- Page gates: `resolveSquadAdminOrRedirect` requires `isSquadAdmin` (or superadmin) and otherwise redirects to the squad root; `resolveSquadUserOrRedirect` requires a `Player` row in *this* squad; `/platform/squads`'s `getServerSideProps` requires `session.user.isSuperAdmin` and otherwise redirects to `/`.
- API gates: `requireSquadAdmin` / `requireSuperAdmin`, or an explicit `getSquadAccess` membership check in the member-facing routes (`players/open-slot`, `games/my-matches`, `user/scores`, all four `replacements/*` routes).
- A sweep of `frontend/src/pages/api/**` for routes with no session check at all returns only endpoints that are already public by design — `rankings/*`, `encounters/history`, `games/in-progress`, `games/[id]/live`, `players/[id]/encounters`, `players/index` (GET) — plus `api/db/init.ts`, which is a no-op handler that touches nothing.

So a zero-squad session can see exactly what a signed-out visitor can see, plus the new browse surface. The verification section below re-checks this empirically rather than trusting the read.

**What this does raise** is that a session no longer implies membership anywhere, so the new routes must never infer the caller's identity from anything but the session — see next.

## Whose email — the one rule the write path must not get wrong

**Every write takes the actor's email from `getServerSession`, never from a request body.** Before this change, forging a request as another person required an email that was already known to a squad; now any Google account can obtain a session, so a body-supplied email is a request-forgery hole.

The first draft's signatures — `createJoinRequest(squadId, { email, ... })` and `withdrawJoinRequest(id, email)` — read as an invitation to pass `req.body.email` straight through. The implementation must make that impossible rather than leaving it to each route's discipline:

- The route reads `session.user.email`, lowercases it, and passes it as its own argument (`actorEmail`), distinct from the request payload. Name it so that a body field can't be silently substituted.
- `POST /join-requests` ignores any `email` in the body entirely. Only `name` and `message` come from the caller.
- `DELETE /join-requests/[id]` compares the row's `email` against the session email. Not a body field, not a query param.
- `PATCH /join-requests/[id]` records `decidedByEmail` from the admin's session, after `requireSquadAdmin`.

This is worth an explicit unit test per route, not just a code-review note.

## Domain logic — `frontend/src/lib/joinRequests.ts` (new)

Modelled on `lib/replacements.ts`: a domain module outside `lib/ranking/` (this is roster membership, not scoring), throwing `ValidationError` (`lib/api/validationError.ts`) for caller error so routes answer 400 rather than a blanket 500.

- **`createJoinRequest(squadId, actorEmail, { name, message })`** — one `$transaction`: squad exists and is `enabled && openForOpenSlot`; squad is below `maxPlayers` if set; no `Player` already exists for `(squadId, actorEmail)`; no `PENDING` row already exists for `(squadId, actorEmail)`; insert. Name trimmed and required at 1–32 chars, message optional at ≤500. The length check matters: a Google display name can easily exceed 32 characters, and without it the failure surfaces as a database error at approval time, one step removed from the person who could have fixed it.
- **`listJoinRequestsForSquad(squadId, status?)`** — the admin oversight list.
- **`listJoinRequestsForEmail(actorEmail)`** — the requester's own rows across **all** squads and **all** statuses, independent of whether those squads are still open. This is what keeps a pending request visible after a squad is flipped closed or disabled (see "My requests must not depend on the directory").
- **`withdrawJoinRequest(id, actorEmail)`** — the row's `email` must equal `actorEmail`; `PENDING` → `WITHDRAWN`.
- **`approveJoinRequest(squadId, id, actorEmail, { playerType, initialScore, name })`** — one `$transaction`: re-read the row and require `PENDING` (the guard against a double-click, or two admins deciding the same request at once); **re-validate the name** (trimmed, 1–32) since the admin may have edited it and `addPlayer` performs no such check; then resolve against any existing player (below); call `addPlayer` with the transaction client; stamp `status: APPROVED`, `decidedAt`, `decidedByEmail: actorEmail`, `createdPlayerId`. The player row and the decision stamp commit together or not at all — a created player with a still-`PENDING` request would invite a duplicate-player second approval.
- **`rejectJoinRequest(squadId, id, actorEmail)`** — `PENDING` → `REJECTED` plus the decision stamps.

### Approving when the player already exists

An admin can add a player manually through `AddPlayerModal` while a request for that same email sits `PENDING`. The first draft's "re-check no `Player` exists, else fail" would then leave the row `PENDING` **forever**, still showing in the admin list with buttons that can never succeed. A dead state is worse than either outcome.

**Resolution: approval is idempotent against an existing player.** If a `Player` already exists for `(squadId, email)`, `approveJoinRequest` does *not* create a second one and does *not* fail. It stamps the request `APPROVED` with `createdPlayerId` set to the existing player's id and returns a flag the UI renders as "Already on the roster — request closed". The admin's intent ("this person should be a member") is already satisfied; the request is simply reconciled with reality.

Belt and braces: also catch Prisma's **P2002** unique-constraint violation on `(squadId, email)` inside the approve transaction and convert it to a `ValidationError`. Today that surfaces as a 500. The pre-check makes it unlikely, not impossible — two admins approving concurrently can interleave between check and insert.

### A `DISABLED` player still counts as a member

`getSquadsForEmail`, `getSquadAccess`, and the "already a member" check all treat **any** `Player` row as membership, with no status filter. So a deactivated person cannot re-request, and browse would show them "You're a member" for a squad they were removed from.

**This plan keeps that behavior**, deliberately: re-activating a former member is an admin action on an existing row, not a new registration, and making the member check status-aware would let a second `Player` row be created for the same `(squadId, email)` — which the unique index forbids anyway. What must change is the **message**: browse shows "You're on this squad's roster (currently inactive) — contact an admin", not a bare "You're a member". If self-re-application after deactivation is genuinely wanted, that needs a reactivation path on the existing row, which is a separate piece of work.

### `frontend/src/lib/squadDirectory.ts` (new)

`listOpenSquads(actorEmail)` returns every `enabled && openForOpenSlot` squad as `{ id, name, slug, playerCount, maxPlayers, scheduleSummary }` **plus this caller's state for it** — `member` | `memberInactive` | `pending` | `full` | `none` — so the browse page renders the right call to action from one response instead of N follow-up fetches.

`scheduleSummary` is derived from the existing `SquadScheduleData` shape in `lib/squadSchedule.ts` and **must have an explicit empty state**: `Squad.schedule` is nullable and may carry `isRecurring: false`, so the card renders "Schedule not set" rather than a blank line or a crash.

### Two supporting edits to `lib/ranking/players.ts`

- **`addPlayer` takes an optional transaction client** — `addPlayer(squadId, input, client: Prisma.TransactionClient = prisma)`, using `client.` internally — so approval can run it inside the transaction above. Default parameter, so existing callers are untouched. (This signature typechecks as written; see "A rejected review point".)
- **The `maxPlayers` cap throws `ValidationError` instead of a bare `Error`**, so a capacity-blocked approval returns 400 with the reason. This also fixes the existing add-player route, which currently answers 500 for it.

`addPlayer` deliberately gains **no** name-length validation — that stays at the two entry points (`createJoinRequest` and `approveJoinRequest`), so the existing add-player path is unchanged.

## API routes

| Route | Method | Gate |
|---|---|---|
| `api/squads/open.ts` | GET — open squads + caller state | signed in |
| `api/squads/join-requests.ts` | GET — **caller's own rows, all squads, all statuses** | signed in |
| `api/squads/[squadId]/join-requests/index.ts` | POST — create own (body: `name`, `message` only) | signed in |
| " | GET — list this squad's | `requireSquadAdmin` |
| `api/squads/[squadId]/join-requests/[id].ts` | PATCH — `{ decision: 'approve' \| 'reject', playerType?, initialScore?, name? }` | `requireSquadAdmin` |
| " | DELETE — withdraw | signed in **and** session email matches the row |
| `api/squads/[squadId]/open-slot-settings.ts` | PATCH — gains `openForOpenSlot` | `requireSquadAdmin` (existing route) |

Squad-scoped routes use `parseSquadId` (`lib/api/squadParam.ts`) and the `isValidationError → 400, else 500` catch already used by `players/bulk-initial-score.ts`. `replacements/[id]/cancellation.ts` is the closest existing template for the PATCH-decision route, down to the `{ decision: 'approve' | 'reject' }` body shape — deliberately the same so the two admin decision surfaces read alike.

`open.ts` and `join-requests.ts` are static segments under `api/squads/`, which Next.js resolves ahead of the `[squadId]` dynamic segment, so they never reach `parseSquadId`.

### My requests must not depend on the directory

`GET /api/squads/join-requests` exists precisely because `listOpenSquads` filters to `enabled && openForOpenSlot`. Without it, a squad that closes or is disabled while a request is pending takes that request off every surface the requester can reach — they can neither see it nor withdraw it. The browse page merges the two responses: open squads from the directory, **plus** any of the caller's own pending rows whose squad is no longer listed, rendered with a "no longer accepting requests" note and a withdraw button.

## UI

### Routing: `/squads` stays the picker

**`/squads` keeps its current behavior unchanged, redirect and all.** Its `getServerSideProps` redirects straight to `/s/{slug}` when the caller belongs to exactly one squad — so it is the wrong home for browse, pending-request, or withdraw UI, which a one-squad member would never see. (The first draft put them there; that was the flow's worst collision.)

**Everything new lives on `pages/squads/browse.tsx`** — a non-squad page (no `SquadContext`), signed-in only, showing the sign-in prompt otherwise exactly as `pages/squads.tsx` does. It carries the directory, the request modal, the caller's pending requests, and withdraw. `pages/squads.tsx` and `pages/squads/browse.tsx` coexist fine in the Pages Router.

`pages/squads.tsx` changes in exactly one respect: its zero-squad empty state currently reads "You're not a member of any squad yet - ask a squad admin to add you", which is now false. It becomes a link to `/squads/browse`.

**`pages/login.tsx`** — post-sign-in destination moves from `/` to `/squads`, and **both call sites must change**: `signIn('google', { callbackUrl: '/' })` and the `useEffect` that calls `router.push('/')` whenever a session exists. Changing one leaves the other.

Note this is **not** neutral for existing users, contrary to the first draft's claim: a one-squad member now lands on their own board (via the `/squads` redirect) instead of the public aggregate, and a multi-squad member lands on the picker. Both are arguably better destinations than `/` for a signed-in user, which is why the change is proposed — but it is a behavior change, not a no-op, and should be reviewed as one.

### Entry points

**`components/nav/SquadSwitcherLinks.tsx`** — a "Find a squad" row pointing at `/squads/browse`. This component renders both the desktop account menu (`AccountMenu.tsx`) and the mobile menu (`MobileScoreboardMenu.tsx`), so one component covers both — but it has **two completely separate render trees**: an early return for `squads.length === 0`, and the normal list below it. The row must be added to **both**, or existing members (the "looking for a second squad" case this plan claims to serve) get no nav path to it at all.

It calls neither `useSquad()` nor `useOptionalSquad()`, so it stays safe on non-squad pages — the gotcha `frontend/docs/squad-tenancy.md` documents under "squad-scoped links in shared components".

**The squad's own public board, `/s/[slug]`** — in scope. This is link-public and is the page a newcomer handed a link actually opens; sending them to a directory to find the squad they are already looking at is silly. When the viewer is signed in, is not a member, and the squad is `openForOpenSlot`, the board renders a "Request to join" CTA opening the same shared modal. `resolveSquadOrNotFound` already resolves `isPlayerHere` for a signed-in viewer, so the data is present; the squad prop needs `openForOpenSlot` added to `SquadSummary`.

### The request modal and the admin surface

**`components/squads/JoinRequestModal.tsx` (new)** — shared by the browse cards and the board CTA: name prefilled from the Google session and editable (enforced at 1–32 chars client-side, matching the server), optional message. It posts `{ name, message }` only — no email field, by design.

**`components/player-management/JoinRequestOversight.tsx` (new)** — mounted on `pages/s/[squad]/admin/players.tsx` alongside the existing `ReplacementOversight`, which is the direct template: SWR fetch, one table, a status badge per row, and per-row action buttons gated on the actionable state via a `decidingId` busy flag and an inline error line.

Following that template faithfully means the list shows **all** requests with status badges, not just pending ones — `ReplacementOversight` already works that way. That is the behavior wanted here too, and it is worth stating rather than leaving implied: with re-requesting after rejection allowed (open question 4), an admin needs to see that they already turned this person down. Pending rows sort first; decided rows follow, newest first.

Approve opens a small modal: player type defaulting to **Open slot**, an editable name, and a starting score that is optional for Open slot and required-and-positive for Fulltime — mirroring the server rule in `api/squads/[squadId]/players/index.ts` rather than restating it differently. When the squad is at `maxPlayers`, the modal explains that the cap is full and only a platform superadmin can raise it.

**`pages/s/[squad]/admin/dashboard.tsx`** — a pending-count badge on the existing Players link, so requests don't sit unnoticed given there is no notification channel. **Data source:** add `pendingJoinRequestCount` to the `GET /api/squads/[squadId]` payload, which already returns `playerCount` behind `requireSquadAdmin` and already feeds `useSquadSettings()`. That is one extra `count` in an existing `Promise.all`, versus a second SWR hook on the dashboard.

**`pages/s/[squad]/admin/settings.tsx`** — the `openForOpenSlot` toggle in the existing "Open-slot players" section, with its own confirmation copy (Decision 2). The `isPublic` section and `visibilityConfirmCopy()` are **unchanged** — that was only required by the reversed version of Decision 2.

**Hooks** — `useOpenSquads.ts`, `useMyJoinRequests.ts` and `useSquadJoinRequests.ts`, following `hooks/useMySquads.ts` (SWR keyed off `useSession` status).

## Testing / verification (for the implementation PR)

**Unit tests**, using the `vi.mock('@/lib/prisma', …)` pattern from `lib/replacements.test.ts` and `lib/ranking/absenteeSpell.test.ts`:

- `lib/joinRequests.test.ts` (new) — a second pending request for the same squad is rejected; an existing member (including a `DISABLED` one) is rejected; a disabled, or not-`openForOpenSlot`, squad is rejected; a squad at `maxPlayers` is rejected at *request* time; approving a non-`PENDING` row is rejected; approval creates the player *and* stamps the row; approval when the player already exists stamps `APPROVED` against the existing id without creating a duplicate; a P2002 during approve surfaces as a `ValidationError`; `FULLTIME` without a score is rejected; `OPEN_SLOT` without a score is allowed; a name over 32 characters is rejected with a message, not a database error, **on both create and approve**.
- Route-level tests that the create path ignores a body `email` and the withdraw path refuses a row belonging to another email — the forgery guard from "Whose email", which is the one thing here that is a security property rather than a correctness one.
- `lib/auth/validateUserAccess.test.ts` — updated for the opened sign-in gate.

**Migration**: apply with `node scripts/prisma-migrate-deploy.mjs` against the local compose DB, then confirm `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code` exits 0.

**End-to-end, in a browser against `npm run dev`:**

1. Confirm a fresh squad is **not** listed on `/squads/browse` until an admin turns `openForOpenSlot` on in settings — the default-off behavior.
2. Sign in with a Google account that belongs to **no** squad — today a hard sign-in failure. Confirm it now succeeds and lands on `/squads`, which offers the link to browse.
3. Browse → request to join an open squad → the card flips to "Request pending", and a second request for the same squad is refused.
4. Open `/s/<slug>` directly as that same non-member and confirm the board's own "Request to join" CTA appears and works.
5. As that squad's admin, open `/s/<slug>/admin/players`, approve as Open slot with no score → the new player appears in the **Not Yet Played** list marked "Needs a score".
6. Open the game planner, select that player, and confirm the existing bulk-assign-score panel blocks "Create Game Day" until a score is assigned. This is the important one: it proves the new entry path cannot leak a scoreless player into the Elo math.
7. Reject a second request; confirm it stays visible in the admin table as Rejected and the requester can request again.
8. With a request pending, turn `openForOpenSlot` **off** for that squad; confirm the requester can still see and withdraw it on `/squads/browse`.
9. Add a player manually by email while a request from that email is pending, then approve the request; confirm it closes as approved against the existing player with no duplicate and no stuck `PENDING` row.
10. As an existing member of squad A, confirm squad B is still browsable and requestable.

**Boundary regression check** — the part of this change most worth distrusting. With the zero-squad session from step 2, confirm each of these still refuses: `/s/<slug>/admin/dashboard` (redirect to the squad root), `/s/<slug>/user/profile` (same), `/platform/squads` (redirect to `/`), `GET /api/squads/<id>/replacements` (401), `PATCH /api/squads/<id>/open-slot-settings` (403).

## `frontend/docs/squad-tenancy.md`

Per the rule in `CLAUDE.md`, the implementation PR updates the living reference in the same change:

- A new **"Self-registration & join requests"** section: the `SquadJoinRequest` model, why identity stayed on email rather than a profile table, `openForOpenSlot` and why it is separate from `isPublic`, the approve-to-`OPEN_SLOT` default with how it meets the existing scoreless-player guardrails, and the session-email-only write rule.
- **Auth & access model** — sign-in is no longer gated on being known to a squad; a zero-squad session is a supported state, and no write may infer identity from a request body.
- **Routing** — add `/squads/browse` and the new API routes, and note that `/squads` deliberately keeps its one-squad redirect.
- **Explicitly out of scope so far** — remove the "browse squads / request to join" bullet, and add the deferred items from this plan's Context section (decision notifications, rate limiting, admin-sent invitations, waitlist, self-re-application after deactivation).

## A rejected review point

Review feedback held that `addPlayer(squadId, input, client: Prisma.TransactionClient = prisma)` "will not typecheck" because `prisma` is a `PrismaClient` rather than a `TransactionClient`, and recommended widening to `Prisma.TransactionClient | PrismaClient`.

**Checked and rejected.** That exact signature was put in a probe file and compiled with `npx tsc --noEmit` against the repo's real `tsconfig.json`: no error. The probe was then given a deliberate type error to confirm the file was genuinely in the compilation (it reported that error), ruling out a false pass. `Prisma.TransactionClient` is `Omit<PrismaClient, ITXClientDenyList>`, and `PrismaClient` is structurally assignable to it.

Recorded here so the union isn't added later as a "fix" for a problem that does not exist.

## Open questions for review

1. **Rejected requests.** Should a rejection block re-requesting for some period, or is "an admin clicks reject again, and can see the previous rejection in the table" good enough at these group sizes?
2. **Login redirect.** `/login` → `/squads` sends one-squad members to their board and multi-squad members to the picker instead of the public aggregate at `/`. Intended improvement, or should signed-in users keep landing on `/`?
3. **Deactivated members.** Confirmed as out of scope above: a `DISABLED` player cannot self-re-apply and sees "on the roster, currently inactive". Is a reactivation request path wanted as follow-up work, or is "contact an admin" the right permanent answer?

**Settled:** the `maxPlayers` cap — open-slot players count against it, and raising it stays a superadmin action (see Decision 3).
