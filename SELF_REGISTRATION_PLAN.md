# Player Self-Registration & Squad Join Requests — Design Plan

**Status:** Proposed — not implemented. This document is up for review; the implementation follows in a separate PR once the decisions below are agreed. Same shape as `OPEN_SLOT_PLAYERS_PLAN.md` (PR #198, approved before its implementation PR #203).

**Scope in one line:** let a person sign in without belonging to any squad, browse the squads that are open, and request to join one — and let a squad admin approve or reject those requests from the admin roster, optionally setting a starting score while approving.

## Context

Getting onto a roster today is entirely an admin action. A squad admin opens `/s/[squad]/admin/players`, types a name and email, and `addPlayer` (`frontend/src/lib/ranking/players.ts`) creates the `Player` row. There is no way for a player to initiate that, and no way for anyone to discover which squads exist and are taking people.

Worse, a prospective member **cannot even sign in**. `validateUserAccessLocal` (`frontend/src/lib/auth/validateUserAccess.ts`) verifies the Google ID token and then calls `isKnownToAnySquad`; an email that is not already a `SquadAdmin` or a `Player` somewhere gets `isAllowed: false`, NextAuth's `signIn` callback returns `false`, and the person lands back on `/login` with a generic error and no explanation. "Sign in first, then ask to join" is not currently expressible.

Both `frontend/docs/squad-tenancy.md` and `OPEN_SLOT_PLAYERS_PLAN.md` list the public "browse squads / request to join as open-slot" flow under *explicitly out of scope so far*. This plan is that work.

**In scope:**

- A signed-in session that belongs to zero squads becomes a real, supported state.
- A directory of joinable squads, reachable from the account menu, for signed-out-of-everything newcomers *and* for existing members looking for a second squad.
- A `SquadJoinRequest` record with an admin approve/reject decision, where approving creates the `Player` row.

**Explicitly out of scope** (called out here so the follow-up PR isn't expected to carry them):

- **Notifying a requester of the decision.** There is no per-user notification channel — `lib/telegram/` is a single global group poll, and no transactional email is configured. The requester sees the state on `/squads`. Adding a channel is its own piece of work.
- **Rate limiting beyond one pending request per squad per email.** Anyone with a Google account can now sign in, so a determined person can create requests across every open squad. Each one still costs an admin a single click to reject. If this turns into real spam, the answer is a rate limit or an invite code, not a narrower sign-in gate.
- **Squad-side invitations** (an admin sending someone a link). This is the pull direction only.
- **A self-service starting score.** The admin sets it, or leaves it unset; nothing about an approved player's rank is self-declared.

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

**This is not a one-way door.** A `UserProfile` keyed on `email @unique` can be added later as a pure lookup table — cross-squad display name, avatar, notification preferences — without touching `Player`, auth, or any query in `lib/ranking/`. Nothing in this plan makes that harder. If a reviewer wants the profile now anyway, say so: it is a bigger migration but the rest of this plan is unchanged by it.

## Decision 2 — "open for registration" reuses `Squad.isPublic`

A squad is listed in the browse directory iff `enabled && isPublic`. **No new column.**

`isPublic` (default `true`) currently means one thing: this squad's active ranked players feed the site-root aggregate leaderboard at `/`. It is already squad-admin-editable (`PATCH /api/squads/[squadId]/visibility`) with a toggle on `/s/[squad]/admin/settings`. After this change it means two things: listed on the public board, **and** listed as joinable.

The alternative considered was a separate `Squad.allowJoinRequests` boolean, which would let a squad have a public leaderboard and a closed roster. That is a real configuration someone might want, and reusing `isPublic` genuinely takes it away — the only lever such a squad has is turning `isPublic` off, which also drops it from the aggregate board.

Reusing it anyway, for two reasons. First, every request is admin-approved, so the failure mode of an unwanted listing is *noise an admin clicks away*, not an unwanted member. Second, one less setting is one less thing to explain on a settings page that already carries Status, Visibility, Open-slot players and Play schedule. If the two meanings need splitting later, adding `allowJoinRequests` (defaulting to `isPublic`'s current value) is a straightforward additive migration.

**Required consequence:** the Visibility section's copy on `/s/[squad]/admin/settings.tsx` must be rewritten to state both meanings, and so must the corresponding paragraph in `frontend/docs/squad-tenancy.md`. A toggle that silently gains a second effect is the main risk this decision carries.

## Decision 3 — approval creates an `OPEN_SLOT` player, score optional

The approve action defaults to `playerType: OPEN_SLOT` with no starting score, and the admin may override to `FULLTIME` (which, unchanged, requires a score > 0) or type a starting score for either.

This falls out of the guardrails `OPEN_SLOT_PLAYERS_PLAN.md` already built, with no new special cases:

- `Player.rankScore` is nullable and an `OPEN_SLOT` player may legitimately have none.
- A scoreless player lands in the admin roster's **"Not Yet Played"** list (`?status=enabled`) flagged "Needs a score" via `PlayerInfo.hasScore`.
- They stay selectable in the game planner, but the existing bulk-assign-score panel **blocks "Create Game Day"** while any selected player is scoreless, and the server-side gate in `POST/PUT /api/squads/[squadId]/games` rejects such a group with a 400 regardless of the UI.
- `applyAbsenteeDeductions` skips a scoreless player and `calculateAndPersistElo` throws on one, as a second line of defence.

So an approved-but-unscored self-registrant is already a safe state that the ranking math cannot reach. The admin can decide the starting score when it matters — at the first game day — rather than being forced to invent one at approval time.

**One thing to surface in the UI:** `addPlayer` rejects a new player once the squad is at `maxPlayers`, and `maxPlayers` is **superadmin-only** editable. A squad admin whose squad is at its cap cannot approve and cannot unblock themselves. The approve modal must say that explicitly rather than showing a bare failure. (Changing who can edit `maxPlayers` is out of scope here.)

---

## Data model (`frontend/prisma/schema.prisma`)

One new model, one new enum. **No change to `Player`, `Encounter`, `ScoreHistory`, or `Game`.**

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
  email           String            @db.VarChar(255)
  // VarChar(32) deliberately matches Player.name: this string becomes that one on approval,
  // so validating it here means the approval insert can't fail on length.
  name            String            @db.VarChar(32)
  message         String?           @db.VarChar(500)
  status          JoinRequestStatus @default(PENDING)
  createdAt       DateTime          @default(now()) @map("created_at")
  decidedAt       DateTime?         @map("decided_at")
  decidedByEmail  String?           @map("decided_by_email")
  // The Player row approval created. Not an FK relation - it's an audit breadcrumb, and a
  // deleted player shouldn't block reading the request history.
  createdPlayerId Int?              @map("created_player_id")

  squad Squad @relation(fields: [squadId], references: [id])

  @@index([squadId, status])
  @@index([email])
  @@map("SQUAD_JOIN_REQUEST")
}
```

Plus `joinRequests SquadJoinRequest[]` on `Squad`.

**Decided rows are kept, never deleted.** `APPROVED` / `REJECTED` / `WITHDRAWN` rows are the audit trail for "why is this person on the roster" and "did we already turn them down", and keeping them is what lets someone re-request after a rejection without a partial-unique-index problem.

**No unique constraint enforcing "at most one `PENDING` per `(squadId, email)`."** MySQL has no partial/filtered unique index, so that rule cannot be a constraint. This is exactly the situation `SlotReplacement` is already in — `schema.prisma` notes that "MySQL can't express 'no overlapping ranges' as a constraint; the overlap check has to happen application-side inside the same transaction as the insert" — and this plan follows that precedent rather than inventing a second pattern: check-then-insert inside one `prisma.$transaction`.

**Migration.** Pure additive `CREATE TABLE`; no backfill, no nullable-then-tighten staging. Per `CLAUDE.md`, generate the SQL with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (with a `--shadow-database-url`), check it in as `frontend/prisma/migrations/<YYYYMMDDHHMMSS>_squad_join_requests/migration.sql`, apply with `node scripts/prisma-migrate-deploy.mjs`, and confirm zero drift with the `migrate diff --exit-code` check.

## Opening sign-in

`validateUserAccessLocal` drops the `isKnownToAnySquad` gate: a Google ID token that verifies, with `emailVerified`, is enough. `AuthResponse` keeps its shape (`isAllowed` stays, and is simply always `true` when the token verifies), so NextAuth's `signIn` and `session` callbacks need no change. `isKnownToAnySquad` itself becomes unused and is removed from `lib/auth/squadAccess.ts`; `validateUserAccess.test.ts`'s "unknown email is denied" cases invert.

That gate is the app's only current membership check at the door, so removing it deserves a proper argument rather than an assertion. **The claim is that it was never load-bearing**, because every real boundary re-resolves membership per request and none of them consult it:

- `middleware.ts` matches only `/s/:squad/admin/*`, `/s/:squad/user/*` and `/platform/*`, and its `authorized` callback is `!!token` — "signed in at all", nothing more. Its own comment already says the real boundary is elsewhere.
- Page gates: `resolveSquadAdminOrRedirect` requires `isSquadAdmin` (or superadmin) and otherwise redirects to the squad root; `resolveSquadUserOrRedirect` requires a `Player` row in *this* squad; `/platform/squads`'s `getServerSideProps` requires `session.user.isSuperAdmin` and otherwise redirects to `/`.
- API gates: `requireSquadAdmin` / `requireSuperAdmin`, or an explicit `getSquadAccess` membership check in the member-facing routes (`players/open-slot`, `games/my-matches`, `user/scores`, all four `replacements/*` routes).
- A sweep of `frontend/src/pages/api/**` for routes with no session check at all returns only endpoints that are already public by design — `rankings/*`, `encounters/history`, `games/in-progress`, `games/[id]/live`, `players/[id]/encounters`, `players/index` (GET) — plus `api/db/init.ts`, which is a no-op handler that touches nothing.

So a zero-squad session can see exactly what a signed-out visitor can see, plus the new browse surface. The verification section below re-checks this empirically rather than trusting the read.

## Domain logic — `frontend/src/lib/joinRequests.ts` (new)

Modelled on `lib/replacements.ts`: a domain module outside `lib/ranking/` (this is roster membership, not scoring), throwing `ValidationError` (`lib/api/validationError.ts`) for caller error so routes answer 400 rather than a blanket 500.

- **`createJoinRequest(squadId, { email, name, message })`** — one `$transaction`: squad exists and is `enabled && isPublic`; no `Player` already exists for `(squadId, email)`; no `PENDING` row already exists for `(squadId, email)`; insert. Name trimmed and required at 1–32 chars, message optional at ≤500. The length check matters: a Google display name can easily exceed 32 characters, and without it the failure surfaces as a database error at approval time, one step removed from the person who could have fixed it.
- **`listJoinRequestsForSquad(squadId, status?)`** — the admin oversight list.
- **`listJoinRequestsForEmail(email)`** — the requester's own rows across all squads, for `/squads` and the browse page.
- **`withdrawJoinRequest(id, email)`** — owner-only, `PENDING` → `WITHDRAWN`.
- **`approveJoinRequest(squadId, id, decidedByEmail, { playerType, initialScore, name })`** — one `$transaction`: re-read the row and require `PENDING` (this is the guard against a double-click, or two admins deciding the same request at once); re-check no `Player` exists for that email in the squad; call `addPlayer` with the transaction client; stamp `status: APPROVED`, `decidedAt`, `decidedByEmail`, `createdPlayerId`. The player row and the decision stamp commit together or not at all — a created player with a still-`PENDING` request would invite a duplicate-player second approval.
- **`rejectJoinRequest(squadId, id, decidedByEmail)`** — `PENDING` → `REJECTED` plus the decision stamps.

### `frontend/src/lib/squadDirectory.ts` (new)

`listJoinableSquads(email)` returns every `enabled && isPublic` squad as `{ id, name, slug, playerCount, maxPlayers, scheduleSummary }` **plus this caller's state for it** — `member` | `pending` | `none` — so the browse page renders the right call to action from one response instead of N follow-up fetches. The schedule line ("Wednesdays 19:00–21:00") comes from the existing `SquadScheduleData` shape in `lib/squadSchedule.ts`.

### Two supporting edits to `lib/ranking/players.ts`

- **`addPlayer` takes an optional transaction client** — `addPlayer(squadId, input, client: Prisma.TransactionClient = prisma)`, using `client.` internally — so approval can run it inside the transaction above. Default parameter, so existing callers are untouched.
- **The `maxPlayers` cap throws `ValidationError` instead of a bare `Error`**, so a capacity-blocked approval returns 400 with the reason. This also fixes the existing add-player route, which currently answers 500 for it.

## API routes

| Route | Method | Gate |
|---|---|---|
| `api/squads/joinable.ts` | GET | signed in |
| `api/squads/[squadId]/join-requests/index.ts` | POST — create own | signed in |
| " | GET — list this squad's | `requireSquadAdmin` |
| `api/squads/[squadId]/join-requests/[id].ts` | PATCH — `{ decision: 'approve' \| 'reject', playerType?, initialScore?, name? }` | `requireSquadAdmin` |
| " | DELETE — withdraw | signed in **and** owner of the row |

Squad-scoped routes use `parseSquadId` (`lib/api/squadParam.ts`) and the `isValidationError → 400, else 500` catch already used by `players/bulk-initial-score.ts`. `replacements/[id]/cancellation.ts` is the closest existing template for the PATCH-decision route, down to the `{ decision: 'approve' | 'reject' }` body shape — deliberately the same so the two admin decision surfaces read alike.

`joinable.ts` is a static segment under `api/squads/`, which Next.js resolves ahead of the `[squadId]` dynamic segment, so it never reaches `parseSquadId`.

## UI

**Entry point — `components/nav/SquadSwitcherLinks.tsx`.** A "Find a squad" row in the Squads section. One edit covers both the desktop account menu and the mobile menu, since `AccountMenu.tsx` and `MobileScoreboardMenu.tsx` both render this component, and it already has a zero-squad branch. It calls neither `useSquad()` nor `useOptionalSquad()`, so it is safe on non-squad pages — the gotcha `frontend/docs/squad-tenancy.md` documents under "squad-scoped links in shared components".

**`pages/squads/browse.tsx` (new)** — a non-squad page (no `SquadContext`), signed-in only, showing the sign-in prompt otherwise exactly as `pages/squads.tsx` does. One card per joinable squad: name, roster count against cap, schedule line, and a single call to action that is "Request to join", "Request pending", or "You're a member — open board". Requesting opens `components/squads/JoinRequestModal.tsx` (new): name prefilled from the Google session, optional message. `pages/squads.tsx` and `pages/squads/browse.tsx` coexist fine in the Pages Router.

**`pages/squads.tsx`** — the zero-squad empty state currently reads "You're not a member of any squad yet - ask a squad admin to add you", which is now false. Replace with the "Find a squad" call to action, and list the caller's own pending requests with a withdraw button.

**`pages/login.tsx`** — post-sign-in redirect moves from `/` to `/squads`, so a brand-new user lands somewhere that tells them what to do next. Existing users are unaffected: `/squads` already redirects a one-squad member straight to their board.

**`components/player-management/JoinRequestOversight.tsx` (new)** — mounted on `pages/s/[squad]/admin/players.tsx` alongside the existing `ReplacementOversight`, which is the direct template (SWR fetch, per-row approve/reject with a `decidingId` busy flag and an inline error line). Approve opens a small modal: player type defaulting to **Open slot**, an editable name, and a starting score that is optional for Open slot and required-and-positive for Fulltime — mirroring the server rule in `api/squads/[squadId]/players/index.ts` rather than restating it differently.

**`pages/s/[squad]/admin/dashboard.tsx`** — a pending-count badge on the existing Players link, so requests don't sit unnoticed given there is no notification channel.

**`pages/s/[squad]/admin/settings.tsx`** — no new control, but the Visibility copy must now state both meanings of public (Decision 2).

**Hooks** — `useJoinableSquads.ts` and `useSquadJoinRequests.ts`, following `hooks/useMySquads.ts` (SWR keyed off `useSession` status).

## Testing / verification (for the implementation PR)

**Unit tests**, using the `vi.mock('@/lib/prisma', …)` pattern from `lib/replacements.test.ts` and `lib/ranking/absenteeSpell.test.ts`:

- `lib/joinRequests.test.ts` (new) — a second pending request for the same squad is rejected; an existing member is rejected; a disabled or private squad is rejected; approving a non-`PENDING` row is rejected; approval creates the player *and* stamps the row; `FULLTIME` without a score is rejected; `OPEN_SLOT` without a score is allowed; a name over 32 characters is rejected with a message, not a database error.
- `lib/auth/validateUserAccess.test.ts` — updated for the opened sign-in gate.

**Migration**: apply with `node scripts/prisma-migrate-deploy.mjs` against the local compose DB, then confirm `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code` exits 0.

**End-to-end, in a browser against `npm run dev`:**

1. Sign in with a Google account that belongs to **no** squad — today a hard sign-in failure. Confirm it now succeeds and lands on `/squads` with the "Find a squad" call to action.
2. Browse → request to join a public squad → the card flips to "Request pending", and a second request for the same squad is refused.
3. As that squad's admin, open `/s/<slug>/admin/players`, approve as Open slot with no score → the new player appears in the **Not Yet Played** list marked "Needs a score".
4. Open the game planner, select that player, and confirm the existing bulk-assign-score panel blocks "Create Game Day" until a score is assigned. This is the important one: it proves the new entry path cannot leak a scoreless player into the Elo math.
5. Reject a second request; confirm it shows as Rejected and the requester can request again.
6. As an existing member of squad A, confirm squad B is still browsable and requestable.

**Boundary regression check** — the part of this change most worth distrusting. With the zero-squad session from step 1, confirm each of these still refuses: `/s/<slug>/admin/dashboard` (redirect to the squad root), `/s/<slug>/user/profile` (same), `/platform/squads` (redirect to `/`), `GET /api/squads/<id>/replacements` (401), `PATCH /api/squads/<id>/visibility` (403).

## `frontend/docs/squad-tenancy.md`

Per the rule in `CLAUDE.md`, the implementation PR updates the living reference in the same change:

- A new **"Self-registration & join requests"** section: the `SquadJoinRequest` model, why identity stayed on email rather than a profile table, why `isPublic` was reused and what that trade-off costs, and the approve-to-`OPEN_SLOT` default with how it meets the existing scoreless-player guardrails.
- **Auth & access model** — sign-in is no longer gated on being known to a squad; a zero-squad session is a supported state.
- **Routing** — add `/squads/browse` and the new API routes.
- **Squad visibility: `isPublic`** — note the second meaning it now carries.
- **Explicitly out of scope so far** — remove the "browse squads / request to join" bullet, and add the deferred items from this plan's Context section (decision notifications, rate limiting, admin-sent invitations).

## Open questions for review

1. **Profile table** (Decision 1) — agreed that email stays the identity, or do you want `UserProfile` built now anyway?
2. **`isPublic` reuse** (Decision 2) — acceptable that public now also means "accepting join requests", or is a separate `allowJoinRequests` toggle worth the extra setting?
3. **`maxPlayers` and approval** — a squad at its cap cannot approve anyone, and only a platform superadmin can raise the cap. Leave it (admin sees a clear message) or make `maxPlayers` squad-admin-editable in a follow-up?
4. **Rejected requests** — should a rejection block re-requesting for some period, or is "an admin clicks reject again" good enough for the group sizes this app actually serves?
