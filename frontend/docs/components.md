# ShuttleTrack UI components (public leaderboard pass)

Reference for building and extending the dark leaderboard UI. Full tokens: [design.md](./design.md).

## Implemented in this pass

### SiteHeader

**File:** `src/components/NavigationComponent.tsx`

**Purpose:** Fixed top navigation — logo-only brand, primary routes, auth, optional live games.

**Desktop layout (md+):** three-column grid — logo (`h-16`) seated in a solid black `h-20` band (left), centered **Rankings** / **Encounters** / **History**, right zone **Live** + Sign In or avatar.

**Mobile:** hamburger left, centered logo (`h-12`) in a `h-16` band, auth (+ live dot) on the right; full-screen panel matching the black bar.

**Behavior:**

- Encounters → scrollable player list → `/player/{id}/encounters`
- History → Ranking History, Encounter History
- Live → game viewer links with progress (hidden on desktop when no live games)
- Session: Management, Admin Dashboard, Sign out

**Visual:** orange `border-b-2 border-primary` underline on active top-level links; dark dropdown surfaces (`surface-container`); no emerald pills or light menus.

---

### SiteFooter

**File:** `src/components/layout/SiteFooter.tsx`

**Purpose:** Page footer with club wordmark and copyright.

**Content:** Dutch Lankan Shuttle Masters italic wordmark (desktop only); copyright year; links to `/`, `/encounter-history`, `/player-ranking-history`. **Mobile:** `py-6`, copyright `text-xs`, links in one `flex-nowrap` row (`text-xs`, `gap-4`). **Desktop:** wordmark + copyright left, links right (`py-12`).

**Used in:** `src/components/layout/Layout.tsx`

---

### PageHeader

**File:** `src/components/leaderboard/PageHeader.tsx`

**Props:** `title`, `subtitle` (optional)

**Default copy:** "Leaderboard" as a **`font-headline`** display title (`text-3xl`–`text-4xl font-extrabold`), `px-8 sm:px-16` aligns the left edge with the `RANK` column. A thin orange accent rule (`h-0.5 w-10 bg-primary`) sits below the heading. No subtitle on the homepage.

---

### Leaderboard

**File:** `src/components/leaderboard/Leaderboard.tsx`

**Props:** `players: PlayerRankingData[]` (active ranks only)

**Renders:** Desktop column header row + list of `LeaderboardRow`.

---

### LeaderboardRow

**File:** `src/components/leaderboard/LeaderboardRow.tsx`

**Props:** One enriched `PlayerRankingData` including `lastFive`, `winRate`, `lastGameDayNet`, `rankChange`.

**Variants:** `podiumGold` | `podiumSilver` | `podiumBronze` | `podiumDark` | `default` from `playerRank`.

**Mobile:** Compact two-row layout — Row 1: smaller `RankBadge` (`text-xl`, smaller trophy) | name + subtitle | `TrendIndicator`; Row 2: Last 5 / Win rate / Last day / Points with `flex-col gap-0.5` captions (no divider). `LastGameDayNet` sits under the Last day caption between Win rate and Points. Tighter card padding (`px-3 py-2`), `space-y-1` between rows. Podium metric captions use dark muted `labelClass`. Desktop unchanged (`md:` sizes and grid).

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

**File:** `src/components/RankingsComponent.client.tsx`

**Purpose:** Fetch via `useRankings`, loading/error states, compose `PageHeader` + `Leaderboard`.

---

### Player encounter history

**Page:** `src/pages/player/[id]/encounters.tsx` → `PlayerEncounterCompactComponent.client.tsx`

**Purpose:** Per-player match history grouped by game day.

**Composes:** Title row (same styling as `PageHeader`); **mobile** trend beside the title, then `RankBadge` left and Last 5 right; **desktop** title left with rank + trend + Last 5 strip on the right. `StatCard` grid, Headless UI `Disclosure` per date with prominent `LastGameDayNet` (`size="lg"`) and a small **Net** / **Net score** caption above or beside the value.

**Match rows:** `EncounterCard` — **mobile** two rows (scoreboard, then `W`/`L` chip | muted `elo` chip inline with headline points); **desktop** five-column grid (`encounterGrid.ts`: wider Score track, centered Score, `W`/`L` in Result only, Points = chips + total inline) + `EncounterDesktopHeader`. Win chip `bg-primary`; loss `bg-red-600`; card left border unchanged.

**Shared:** `ScoreBreakdownPills` (dark chips on `surface-container-high`; muted `elo` caption under headline points on encounter cards; tier/consol chips when non-zero).

**Loading/error:** Same primary ring spinner and red banner as `RankingsComponent`.

---

### Admin Dashboard

**Files:** `src/pages/admin/dashboard.tsx`, `src/components/dashboard/Header.tsx`

**Purpose:** Admin home — quick links, games list, Telegram scheduler test.

**Layout:** `max-w-7xl mx-auto px-4 sm:px-8`. **Mobile-first:** Games card first, then Quick Actions, then Telegram; **desktop (`md+`):** two columns — Actions + Telegram left, Games right.

**Header:** `DashboardHeader` — `font-headline` title, orange accent rule, date subtitle (no avatar/logout; session is in nav).

**Cards:** `rounded-xl bg-surface-container/90 border border-gray-600`. Primary CTA = filled `bg-primary`; secondary/telegram = outline `border-white/10`. Game rows are `Link`s with dark status chips (`IN_PROGRESS` orange, `COMPLETED` muted, `DRAFT` outline).

**Loading:** Primary ring spinner (not DaisyUI).

---

### Game Day

**Files:** `src/pages/admin/game-day.tsx`, `src/components/game-day/GroupCard.tsx`, `src/components/game-day/NavigationButtons.tsx`

**Purpose:** Review skill-tier groups after planner selection; navigate back to planner or forward to score keeper.

**Layout:** `max-w-7xl mx-auto px-4 sm:px-8`. **Mobile-first:** one group card per row; **`md+`:** 2 columns, **`xl+`:** up to 4. Title matches dashboard pattern (`font-headline`, orange accent rule; no subtitle).

**GroupCard:** `rounded-xl bg-surface-container/90 border border-gray-600`; player name + rank; points as `font-numeric` (`rankScore`).

**NavigationButtons:** outline Back, filled `bg-primary` Continue; stacked full-width on mobile (Back then Continue), row `justify-between` on `md+`.

**Loading / not-found:** Primary ring spinner; not-found uses dark tokens (no DaisyUI).

---

### Game Planner

**Files:** `src/pages/admin/game-planner.tsx`, `src/components/game-planner/PlayerCard.tsx`, `src/components/game-planner/ActionPanel.tsx`

**Purpose:** Select 4–20 players (valid group sizes), create or update a draft game, route to game-day.

**Layout:** `max-w-7xl mx-auto px-4 sm:px-8`, `pb-32 md:pb-8` for sticky mobile bar. Title + orange rule; subtitle only on create (“maximum 20”). Player grid `1` / `md:2` / `lg:3` columns (no outer panel).

**PlayerCard:** `button` toggle; unselected solid `bg-surface-container`; selected `border-primary bg-surface-container-high`; orange check circle.

**ActionPanel:** Opaque `fixed` mobile bar (`bg-background`, `border-white/5`); desktop count left, orange CTA right. Validation `text-red-400`; disabled CTA via opacity.

**Loading:** Primary ring spinner (session, players, and game when `gameId` present).

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

---

## Not in this pass

Keep existing DaisyUI patterns until a dedicated restyle:

- **Find Encounters** (`EncounterHistoryComponent`, `/encounter-history`) — form and results table still legacy; pills only share dark `ScoreBreakdownPills`
- Score keeper, manage players
- Modals, password gates, `ActionCard`, score keeper inputs
- History charts (`RankingsHistoryComponent`, Recharts), ranking history page chrome
- Login page styling
- `LoadingSpinner` on admin routes (may still use DaisyUI spinner internally)

When restyling those pages later, reuse tokens from `design.md` and prefer new primitives over new one-off styles.
