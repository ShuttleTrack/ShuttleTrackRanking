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

**Props:** `value: number | null`, `variant`, optional `size` (`sm` | `md`)

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

## Mapping from legacy UI

| Legacy | New |
|--------|-----|
| DaisyUI table in `RankingsComponent` | `Leaderboard` + rows |
| Stats cards (Players / Top / Average) | Removed |
| `renderRankChange` triangles | `TrendIndicator` |
| Score column | Points (`rankScore`) |
| Highest rank column | Player subtitle |

---

## Not in this pass

Keep existing DaisyUI patterns until a dedicated admin restyle:

- Admin dashboard, game planner, game day, score keeper
- Modals, password gates, `ActionCard`, score keeper inputs
- History charts (`RankingsHistoryComponent`, Recharts)
- Login page styling
- `LoadingSpinner` on admin routes (may still use DaisyUI spinner internally)

When restyling those pages later, reuse tokens from `design.md` and prefer new primitives over new one-off styles.
