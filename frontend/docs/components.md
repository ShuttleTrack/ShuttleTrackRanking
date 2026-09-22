# ShuttleTrack UI components (public leaderboard pass)

Reference for building and extending the dark leaderboard UI. Full tokens: [design.md](./design.md).

## Implemented in this pass

### SiteHeader

**File:** `src/components/NavigationComponent.tsx`

**Purpose:** Fixed top navigation — logo-only brand, primary routes, auth, optional live games.

**Desktop layout (md+):** three-column grid — logo (`h-16`) in a solid black `h-20` band (left), centered **scoreboard pill** (Rankings / Encounters / History), right zone **Live** rally chip + Sign In or avatar.

**Mobile:** hamburger left, centered logo (fills `h-16` bar via `h-full object-contain`) on the right when games are in progress. One live game links straight to `/game-viewer`; multiple games open a header dropdown. No chip when nothing is live. Full-screen **scoreboard overlay** (tiles + account) — not nested accordions; body scroll locked while open.

Overlay tile layout: Rankings tile (full-width) → Ranking History / Encounter History (2-column grid) → **Encounters tile** (tap to expand inline search; results appear only after typing, collapsed by default) → Live progress cards (only when >1 game) → account block. No player list is shown until the user types in the Encounters search.

**Behavior:**

- Squad context from `SquadContext` when on `/s/[squad]/**`; rankings/history/encounters links are squad-scoped. On non-squad pages (e.g. `/`, `/squads`), squad-only nav tiles are hidden.
- Encounters → searchable player list (color dot + `#` rank) → `/s/{slug}/player/{id}/encounters`
- History → Ranking History, Encounter History (card rows with short hints) under `/s/{slug}/`
- Live → `/s/{slug}/game-viewer` with progress (hidden when no live games)
- Session: avatar menu → identity header (links to profile when player in current squad), Matches, Replacement (when player in squad), Admin Dashboard (squad admin), **Squads** switcher (`SquadSwitcherLinks`), **Join a squad** (`JoinSquadMenuSection` → `/squads/browse`), Sign out

**Visual:** active desktop segment uses `bg-primary/15` orange chip (`aria-current="page"`); dark dropdown surfaces (`surface-container`); kinetic gradient hairline on the nav band. **Avatar menu:** `w-72`, identity block (avatar, name, email; whole row links to profile when the user is a player in the current squad), icon + label rows (`min-h-[44px]`); squad switcher monogram rows + check on current; `ring-primary/40` on photo; dividers; **Sign Out** (`text-red-400`). Mobile overlay uses the same identity + switcher pattern.

---

### SiteFooter

**File:** `src/components/layout/SiteFooter.tsx`

**Purpose:** Page footer with club wordmark and copyright.

**Content:** Minimal — Dutch Lankan Shuttle Masters italic wordmark (`md+` only) and copyright line only (no nav links).

**Used in:** `src/components/layout/Layout.tsx`

---

### PageHeader

**File:** `src/components/leaderboard/PageHeader.tsx`

**Props:** `title`, `subtitle` (optional), `className` (optional — merged onto the section for spacing overrides)

**Default copy:** "Leaderboard" as a **`font-headline`** display title (`text-3xl`–`text-4xl font-extrabold`), `px-8 sm:px-16` aligns the left edge with the `RANK` column. A thin orange accent rule (`h-0.5 w-10 bg-primary`) sits below the heading.

---

### SquadBoardSelector

**File:** `src/components/leaderboard/SquadBoardSelector.tsx`

**Props:** `currentSlug?: string | null` — omit on `/` (Public selected); pass squad slug on `/s/{slug}`.

**Purpose:** Shared selector band (see `design.md`). Split **Squad** cap + Listbox: **Public** + the user’s squads from `useMySquads`. Navigates to `/` or `/s/{slug}`. Renders nothing unless signed in with at least one squad. Uses `useOptionalSquad()` for the closed label when the page squad is not in the membership list.

---

### PublicRankingsCallout

**File:** `src/components/leaderboard/PublicRankingsCallout.tsx`

**Purpose:** On `/`, band above the public leaderboard title. While `useMySquads` is loading, renders empty `SelectorBand` chrome. Signed-in users with squads get `SquadBoardSelector`. Otherwise: `SelectorBand` with `scrim`, lock icon, and one-line caption (sign-in vs join-squad); no in-band CTA.

---

### Public rankings page

**File:** `src/components/PublicRankingsComponent.client.tsx` — page `src/pages/index.tsx`

**Composes:** `PublicRankingsCallout` → `PageHeader` ("Public Leaderboard") → `Leaderboard` with `variant="public"`. Data from `usePublicRankings` / `GET /api/rankings`.

---

### SquadSwitcherLinks

**File:** `src/components/nav/SquadSwitcherLinks.tsx`

**Props:** `squads`, `currentSlug`, `variant` (`account-menu` | `mobile`), optional `onNavigate`

**Purpose:** **Public** row (links to `/`, check when on `/`) plus monogram + name rows per squad with check on `currentSlug`; used in `AccountMenu` and `MobileScoreboardMenu`. Zero squads → link to `/squads`.

**Data:** `useMySquads` → `GET /api/squads` when authenticated.

---

### JoinSquadMenuSection

**File:** `src/components/nav/JoinSquadMenuSection.tsx`

**Props:** `variant` (`account-menu` | `mobile`), optional `onNavigate`

**Purpose:** Divider plus a single **Join a squad** row to `/squads/browse` below `SquadSwitcherLinks` in `AccountMenu` and `MobileScoreboardMenu` (no section heading).

---

### Squad picker & platform admin

**Files:** `src/pages/squads.tsx`, `src/pages/platform/squads.tsx`

**`/squads`:** `PageHeader` + monogram squad rows (dark cards). Single-squad users redirect to `/s/{slug}`.

**`/platform/squads`:** Superadmin only; card rows (no DaisyUI table), dark modals, status chips — same tokens as squad admin settings.

---

### Squad directory & join requests

**Files:** `src/pages/squads/browse.tsx`, `src/components/squads/{JoinRequestModal,JoinSquadCallout}.tsx`, `src/components/player-management/JoinRequestOversight.tsx`

**`/squads/browse`:** Gated-page shell (inline **Join a squad** title + primary accent, `max-w-3xl` content). **Your requests** when pending (withdraw; closed squads show *This squad closed join requests*). **Open squads** list only when non-empty; otherwise a centered empty card (*No open squads*). Each open squad card is stacked: monogram + name, one meta line (schedule · roster), then a full-width equal button row (*View board* + *Request to join* or status chip) — no back link to `/squads`. Signed-out: *Sign in to join a squad* + Google. Uses `PageLoader` while loading; no DaisyUI on this page.

**`JoinSquadCallout`:** quiet secondary row on `/s/[slug]` for a non-member when the squad is open (`useJoinSquadCallout` in `RankingsComponent`, passed as `SquadBoardSelector`'s `trailing` slot) — always inside the striped `SelectorBand`: stacked under the squad selector, centered, on mobile; to its right on `md+`. No border, `bg-surface-container-high`, `font-label` uppercase copy so it stays secondary to the selector's orange-ringed control. *Want to play here?* + *Request a spot* / *Request pending* / *Sign in*; no DaisyUI.

**`JoinRequestModal`:** name prefilled from the Google profile (capped at `Player.name`'s 32 chars, with a counter), optional message, and the signed-in address shown as text — never an editable field, since identity comes from the session server-side.

**`JoinRequestOversight`:** admin table on `/s/[squad]/admin/players`, styled like `ReplacementOversight` — all statuses with badges, actions only on pending rows, so a re-request after a rejection is visibly that. Approve modal defaults to **Open slot** with an optional score.

**Data:** `useOpenSquads` / `useMyJoinRequests` → `GET /api/squads/open` and `GET /api/squads/join-requests`.

---

### Leaderboard

**File:** `src/components/leaderboard/Leaderboard.tsx`

**Props:** `players`, optional `variant`: `squad` (default) | `public`

**Renders:** Desktop column header row + list of `LeaderboardRow`. **Public** variant uses a 5-column grid (no Last day / Trend); rows are not player links.

---

### LeaderboardRow

**File:** `src/components/leaderboard/LeaderboardRow.tsx`

**Props:** One enriched `PlayerRankingData` including `lastFive`, `winRate`, `lastGameDayNet`, `rankChange`.

**Variants:** `podiumGold` | `podiumSilver` | `podiumBronze` | `podiumDark` | `default` from `playerRank`.

**Behavior:** Squad variant: whole row links to `/s/{slug}/player/{id}/encounters`. Public variant: non-interactive `div` (no peak chip on public board).

**Mobile:** Compact two-row layout — Row 1: smaller `RankBadge` (`text-xl`, smaller trophy) | name and `PeakTenure` chip inline | `TrendIndicator`; Row 2: Last 5 / Win rate / Last day / Points with `flex-col gap-0.5` captions (no divider). `LastGameDayNet` sits under the Last day caption between Win rate and Points. Tighter card padding (`px-3 py-2`), `space-y-1` between rows. Podium metric captions use dark muted `labelClass`. Desktop unchanged (`md:` sizes and grid).

---

### PeakTenure

**File:** `src/components/leaderboard/PeakTenure.tsx`

**Props:** `playerRank`, `highestRank`, `timeInHighestRank`, `variant` (row podium styling).

**Shows:** Context-sensitive pill beside the player name on `LeaderboardRow` (same row; name truncates when tight). At peak: tenure only (`18d at peak`, `New peak`, `At peak`). Off peak: `Peak #N · Nd`. Exported `peakTenureCopy()` / `parsePeakTenureDays()` for tests.

---

### RankBadge

**File:** `src/components/leaderboard/RankBadge.tsx`

**Props:** `rank: number`, `variant` (affects text color)

**Shows:** Zero-padded rank (`01`, `02`, …); crown icon rank 1; medal icon ranks 2–4.

---

### FormBars

**File:** `src/components/leaderboard/FormBars.tsx`

**Props:** `results: ('W' | 'L')[]` (length ≤ 5), `variant` (passed for API consistency; colors are row-agnostic), optional `align` (`start` on mobile Last 5 column).

Five vertical bars (`h-3` mobile / `h-4` desktop). **All rows:** orange win, red loss (`rgb(185 28 28)`), ghost empty; `1px` dark outline on each bar for podium readability.

---

### LastGameDayNet

**File:** `src/components/leaderboard/LastGameDayNet.tsx`

**Props:** `value: number | null`, `variant`, optional `size` (`sm` | `md` | `lg` — `lg` for encounter date headers)

Signed one-decimal net (`+12.3` / `-4.5`); `—` when null. Colors align with trend semantics on podium vs dark rows.

---

### TrendIndicator

**File:** `src/components/leaderboard/TrendIndicator.tsx`

**Props:** `rankChange: { direction: 'up' | 'down' | 'none'; amount: number }`, `tone`

Icons: trending up/down or flat; prefix `+`, `-`, or `0`.

---

### Rankings page shell

**File:** `src/components/RankingsComponent.client.tsx` — page `src/pages/s/[squad]/index.tsx`

**Purpose:** Fetch via `useRankings`, loading/error states, compose `SquadBoardSelector` (`currentSlug` from `useOptionalSquad`) → `PageHeader` + `Leaderboard` (`variant="squad"` default).

---

### Player encounter history

**Page:** `src/pages/s/[squad]/player/[id]/encounters.tsx` → `PlayerEncounterCompactComponent.client.tsx`

**Purpose:** Per-player match history grouped by game day.

**Composes:** Title row (same styling as `PageHeader`); **mobile** trend beside the title, then `RankBadge` left and Last 5 right; **desktop** title left with rank + trend + Last 5 strip on the right. `StatCard` grid, Headless UI `Disclosure` per date with prominent `LastGameDayNet` (`size="lg"`) and a small **Net** / **Net score** caption above or beside the value.

**Match rows:** `EncounterCard` — **mobile** two rows (scoreboard, then `W`/`L` chip | muted `elo` chip inline with headline points); **desktop** five-column grid (`encounterGrid.ts`: wider Score track, centered Score, `W`/`L` in Result only, Points = chips + total inline) + `EncounterDesktopHeader`. Win chip `bg-primary`; loss `bg-red-600`; card left border unchanged.

**Shared:** `ScoreBreakdownPills` (dark chips on `surface-container-high`; muted `elo` caption under headline points on encounter cards; tier/consol chips when non-zero).

**Loading/error:** `PageLoader` (`compact`) and red banner as `RankingsComponent`.

---

### Ranking history

**Page:** `src/pages/s/[squad]/player-ranking-history.tsx` → `RankingHistoryView.tsx`

**Purpose:** Player-first view of standing (rank) over time — one focus player at a time instead of an all-player line chart.

**Composes:** Dark page shell (`max-w-7xl`, `px-4 sm:px-8`, `font-headline` title + orange rule). `PlayerPicker` — Headless UI `Listbox` (full-width on mobile and desktop), rank-sorted options with color dot from `colorHex`, selection synced to `?player=`; **Match history** link beside the Player label → `/player/{id}/encounters`. `RankTrajectoryChart` (Recharts): **mobile** single selected line (~220px); **md+** other players at ~12% opacity; reversed Y-axis; tap/click date for dark tooltip (rank + day-over-day delta). `RankChangeList` — newest-first game days with `#old → #new` and `TrendIndicator`; row tap highlights chart date.

**Data:** `useRankingHistory` + `usePlayers`; helpers in `src/utils/rankHistory.ts`. Default player: `?player=` if valid, else signed-in `session.user.playerId`, else current #1.

**Loading/error:** `PageLoader` (`compact`) and red banner as `RankingsComponent`.

**Legacy:** `RankingsHistoryComponent.client.tsx` re-exports `RankingHistoryView` for compatibility.

---

### Encounter history (cross-player search)

**Page:** `src/pages/s/[squad]/encounter-history.tsx` → `EncounterHistoryView.tsx`

**Purpose:** Find matches where selected players appeared together (Team 1 Player 1 required; partner and opponents optional). Results are from Team 1 Player 1’s perspective (same as legacy Find Encounters).

**Composes:** Dark page shell (`max-w-7xl`, `px-4 sm:px-8`, `font-headline` title + orange rule). One filter card with Team 1 / Team 2 slots and orange **VS** chip on desktop; `SearchablePlayerPicker` — Headless UI `Combobox` with typeahead, color dot, optional rank, `excludeIds` for other slots. **Find Matches** (filled `bg-primary`) runs the search; URL updates to `?a1=&a2=&b1=&b2=` on submit (shallow) for share/reload. **Clear** resets pickers and results.

**Results:** `StatCard` row (games / wins / losses / win rate), then a flat list: `EncounterDesktopHeader` + `EncounterCard` rows (newest first) with a muted date caption above each card. Idle until **Find Matches** (shared `?a1=` still hydrates and loads on open).

**Data:** `useEncounterHistory` + `usePlayers`; helpers in `src/utils/encounterHistory.ts`. API: `GET /api/encounters/history`.

**Loading/error:** `PageLoader` (`compact`) for players and in-flight match fetch; red banner as `RankingsComponent`.

**Legacy:** `EncounterHistoryComponent.client.tsx` re-exports `EncounterHistoryView` for compatibility.

---

### Admin Dashboard

**Files:** `src/pages/s/[squad]/admin/dashboard.tsx`, `src/components/dashboard/Header.tsx`

**Purpose:** Admin home — quick links, games list, Telegram scheduler test.

**Layout:** `max-w-7xl mx-auto px-4 sm:px-8`. **Mobile-first:** Games card first, then Quick Actions, then Telegram; **desktop (`md+`):** two columns — Actions + Telegram left, Games right.

**Header:** `DashboardHeader` — `font-headline` title, orange accent rule, date subtitle (no avatar/logout; session is in nav).

**Cards:** `rounded-xl bg-surface-container/90 border border-gray-600`. Primary CTA = filled `bg-primary`; secondary/telegram = outline `border-white/10`. Game rows are `Link`s with dark status chips (`IN_PROGRESS` orange, `COMPLETED` muted, `DRAFT` outline).

**Loading:** `PageLoader` (`compact`).

---

### Game Day

**Files:** `src/pages/s/[squad]/admin/game-day.tsx`, `src/components/game-day/GroupCard.tsx`, `src/components/game-day/NavigationButtons.tsx`

**Purpose:** Review skill-tier groups after planner selection; navigate back to planner or forward to score keeper.

**Layout:** `max-w-7xl mx-auto px-4 sm:px-8`. **Mobile-first:** one group card per row; **`md+`:** 2 columns, **`xl+`:** up to 4. Title matches dashboard pattern (`font-headline`, orange accent rule; no subtitle).

**GroupCard:** `rounded-xl bg-surface-container/90 border border-gray-600`; player name + rank; points as `font-numeric` (`rankScore`).

**NavigationButtons:** outline Back, filled `bg-primary` Continue; stacked full-width on mobile (Back then Continue), row `justify-between` on `md+`.

**Loading / not-found:** `PageLoader` (`compact`); not-found uses dark tokens (no DaisyUI).

---

### Game Planner

**Files:** `src/pages/s/[squad]/admin/game-planner.tsx`, `src/components/game-planner/PlayerCard.tsx`, `src/components/game-planner/ActionPanel.tsx`

**Purpose:** Select 4–20 players (valid group sizes), create or update a draft game, route to game-day.

**Layout:** `max-w-7xl mx-auto px-4 sm:px-8`, `pb-32 md:pb-8` for sticky mobile bar. Title + orange rule; subtitle only on create (“maximum 20”). Player grid `1` / `md:2` / `lg:3` columns (no outer panel).

**PlayerCard:** `button` toggle; unselected solid `bg-surface-container`; selected `border-primary bg-surface-container-high`; orange check circle.

**ActionPanel:** Opaque `fixed` mobile bar (`bg-background`, `border-white/5`); desktop count left, orange CTA right. Validation `text-red-400`; disabled CTA via opacity.

**Loading:** `PageLoader` (`compact`) (session, players, and game when `gameId` present).

---

### Score Keeper

**Files:** `src/pages/s/[squad]/admin/score-keeper.tsx`, `src/components/score-keeper/ProcessScoresModal.tsx`

**Purpose:** Record round-robin match scores per group; start game, submit, process rankings, or cancel.

**Layout:** `max-w-7xl mx-auto px-4 sm:px-8`, `pb-8`. Title + orange rule (no subtitle). Header gear (`bg-primary`, shadow) opens Game Management; ring when active; group pills hidden on management. Group pills (`bg-primary` active) on score views. Solid player chips and match cards; win/loss via tinted team cells (same **Last 5** colors as viewer).

**Management:** progress + Start / Submit / Cancel on solid surface cards.

**Dialogs:** Fixed overlay + `surface-container-high` panel; dark inputs; outline + primary (destructive red for cancel). `ProcessScoresModal` matches same pattern.

**Loading:** `PageLoader` (`compact`) (session, players, game).

**Match rows:** Shared `MatchScoreRow` + `MatchResultLegend` (`src/components/matches/`). Tinted team cells, `showResultChips={false}`, `text-sm` names; legend above the match list on each group view. Score keeper passes `interactive` + `onActivate` when the game is in progress (full `p-3` rows, not `compact`).

---

### Game Viewer

**Files:** `src/pages/s/[squad]/game-viewer.tsx`, `src/components/matches/MatchScoreRow.tsx`

**Purpose:** Public read-only live view of an in-progress game (`/s/{slug}/game-viewer?gameId=…`). Updates via SSE; no score entry.

**Layout:** Same shell as admin pages (`max-w-7xl`). **Mobile-compact:** tighter top margins, smaller title (`text-2xl` → `sm:text-4xl`), reduced progress/legend/group gaps and padding; `sm+` matches admin spacing (`pb-8`, etc.). Centered spectator header: **Game #{id}** with inline red ping-dot (`aria-label="Live"`, no text) plus orange rule (no emoji or “live updates” chip). Progress card on `surface-container` with `font-numeric` count and orange bar (4 players → 3 matches per group, 5 → 5).

**Groups:** Solid bordered cards; group title uses `font-label` `text-sm` uppercase bold (slightly larger than the match progress label), with a primary dot. Matches use `MatchScoreRow` with `showResultChips={false}`, `compact`, and `text-sm` names—win/loss uses `matchResultColors.ts` tints; shared `MatchResultLegend` between the progress card and group list. No `interactive` (display-only).

**Loading / not found:** `PageLoader` (`tall`); dark copy + outline **Go Home** (no DaisyUI `btn`).

---

### User Profile

**Files:** `src/pages/s/[squad]/user/profile.tsx`, `src/hooks/useRequireUser.ts`, `src/components/leaderboard/TrendIndicator.tsx`

**Purpose:** Signed-in players see identity and ranking snapshot at `/s/{slug}/user/profile`.

**Layout:** `max-w-7xl` shell; **Your profile** title + orange rule. `max-w-3xl` card: avatar (`border-primary`), name, email, muted uppercase squad name, outline sign-out; four-column stats (Rank, Change, Score, Highest).

**Loading:** `PageLoader` (`tall`) (session + rankings).

---

### User Matches

**Files:** `src/pages/s/[squad]/user/matches.tsx`, `src/hooks/useRequireUser.ts`, `src/components/matches/MatchScoreRow.tsx`, `src/components/matches/MatchResultLegend.tsx`

**Purpose:** Enter scores for the player’s own unplayed matches in live games (`/s/{slug}/user/matches`).

**Layout:** **Your matches** title + orange rule; `MatchResultLegend`; `max-w-3xl` game cards (live pulse, **Game #{id}**, date). `MatchScoreRow` (`showResultChips={false}`); `interactive` only when unscored. Score modal matches Score Keeper pattern.

**Redirect:** `/user/management` → `/user/profile`.

**Loading:** `PageLoader` (`tall`) (session, players, my-matches).

---

### Login page

**File:** `src/pages/login.tsx`

**Purpose:** Google SSO entry for squad members and admins. Uses the global `Layout` (nav watermark, footer) — no separate marketing shell.

**Composes:** Centered club access card (`max-w-md`, `surface-container/55` + light `backdrop-blur`, kinetic hairline only), static racket mark in a primary ring (no animation), `GoogleSignInButton` (filled `bg-primary`), optional NextAuth error banner (`?error=`), `safeCallbackUrl` for `?callbackUrl=`.

**Loading / redirect:** `LoadingSpinner` → `PageLoader` while session loads or after sign-in until `router.replace(callbackUrl)`.

**Nav:** `AccountMenu` and mobile overlay mark **Sign In** active when `pathname === '/login'`.

**Helpers:** `src/utils/loginAuth.ts` (`safeCallbackUrl`, `getLoginErrorMessage`). `safeCallbackUrl` defaults to **`/squads`**, not `/` — a session with no squad is a real state now, and the public board tells such a person nothing about what to do next. An explicit `?callbackUrl=` still wins. `getLoginErrorMessage`'s `AccessDenied` copy is about *token verification*, not roster membership: not being on a roster no longer blocks sign-in, so "ask a squad admin to add you" would send people away from the join-request flow meant for them.

---

## Mapping from legacy UI

| Legacy | New |
|--------|-----|
| DaisyUI table in `RankingsComponent` | `Leaderboard` + rows |
| Stats cards (Players / Top / Average) | Removed |
| `renderRankChange` triangles | `TrendIndicator` |
| Score column | Points (`rankScore`) |
| Highest rank column | Player subtitle |
| DaisyUI table/stats on player encounters | `StatCard` + `EncounterCard` |
| `PlayerEncounterComponent` mobile table | `EncounterCard` mobile scoreboard layout |
| Multi-player Recharts line chart on ranking history | `RankingHistoryView` player picker + single-line chart + change list |
| DaisyUI Find Encounters form + table | `EncounterHistoryView` filter card + `EncounterCard` results |

---

## Not in this pass

Keep existing DaisyUI patterns until a dedicated restyle:

- Manage players
- Modals and password gates on other admin routes (score keeper and user management score entry restyled; logic unchanged)
- `ActionCard`

When restyling those pages later, reuse tokens from `design.md` and prefer new primitives over new one-off styles.
