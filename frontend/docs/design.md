# ShuttleTrack public UI — design system

Dark, performance-oriented leaderboard aesthetic derived from the Stitch player-rankings mock. **Brand:** Dutch Lankan Shuttle Masters. Do not use placeholder names from the mock (e.g. COURTCLAN).

**Footer:** full club name as italic wordmark on **`md+` only**; mobile shows copyright only (no duplicate wordmark, no link row).

**Page background:** `dutch-lankan-shuttle-masters-logo-gray.png` (transparent gray PNG — near-black pixels knocked out, foreground luminance boosted via `min(255, int(lum * 1.35 + 40))` for light-gray-on-dark legibility) rendered `fixed`, centered, `w-[min(78vw,44rem)]`, `opacity-[0.13]`, `z-0`, `pointer-events-none`. Decorative only — all content is `z-10` above it.

## Color tokens

Use Tailwind theme keys (see `tailwind.config.ts`), not raw hex in components when a token exists.

| Token | Hex | Usage |
|-------|-----|--------|
| `background` | `#1A1A1A` | Page background |
| `surface` | `#1A1A1A` | Same as background |
| `surface-container` / `surface-container-low` | `#282828` | Default leaderboard rows, cards |
| `surface-container-high` / `surface-container-highest` | `#333333` | Elevated surfaces |
| `surface-header` | `#000000` | Fixed nav band and mobile menu |
| `on-background` / `on-surface` | `#F5F5F5` | Primary text |
| `on-surface-variant` | `#C0C0C0` | Subtitles, muted labels |
| `primary` | `#EE8A33` | Brand orange — accents, active nav underline, form win ticks, focus rings |
| `primary-container` | `#F7B375` | Lighter orange — gradients, highlights |
| `secondary` | `#8a7f74` | Muted warm-neutral |
| `outline` / `outline-variant` | `#7a736c` / `#444444` | Borders |
| `error` | `#ba1a1a` | Negative trend (with red-400 on dark rows) |

### Borders

- Nav / footer: `border-white/5`
- Default rows: `border-gray-600`, hover `border-primary/40` or `border-red-500/20` when trend is down

### Podium row backgrounds (inline gradients)

- **Rank 1 (gold):** `135deg` from `#bf953f` → light gold → `#aa771c`
- **Rank 2 (silver):** `#c0c0c0` → `#e8e8e8` → `#c0c0c0`
- **Rank 3 (bronze):** `#a97142` → `#e3a857` → `#a97142`
- **Rank 4 (metallic dark):** `#2a3038` → `#1f242a` → `#16191d` at **90% opacity** + optional `.form-strip` overlay at 10% opacity
- **Rank 5+:** `bg-surface-container/90` (`#282828` at 90% opacity) so the page watermark shows through slightly; podium rows 1–3 stay fully opaque

### Utilities

- `.kinetic-gradient`: `linear-gradient(135deg, #EE8A33 0%, #F7B375 100%)`
- `.form-strip`: diagonal stripe pattern (primary at 5% opacity)

## Typography

| Role | Font | Tailwind |
|------|------|----------|
| Headlines | Manrope | `font-headline` |
| Body | Inter | `font-body` |
| Column labels | Space Grotesk | `font-label` |
| Numeric values (scores, ranks, nets) | Share Tech Mono (400, synthesized bold) | `font-numeric` — `font-bold` + `font-synthesis: weight` in `globals.css` |

- Rankings page title: `font-headline text-3xl`–`text-4xl font-extrabold`; `px-8 sm:px-16` aligns left edge with the `RANK` column; a thin `h-0.5 w-10 bg-primary` accent rule sits beneath the heading.
- Column headers: `font-label text-xs font-bold uppercase tracking-widest opacity-60`
- Footer wordmark: italic, `font-black`, tight tracking — full club name
- Nav links: `font-headline font-semibold`, active `border-b-2 border-white`

## Layout

- Content width: `max-w-7xl mx-auto px-8`
- Fixed nav: solid black band `surface-header` (`#000000`), no gradient, no blur; link row `h-16` mobile / `h-20` desktop; logo seated inside (`h-12` mobile / `h-16` desktop). Active link: `border-b-2 border-primary` orange underline.
- Desktop nav: **three zones** — logo (left), centered links (`gap-8`, `text-sm`), live + auth (right)
- Dropdown panels: `bg-surface-container`, `border-white/5`, `rounded-xl`
- Main offset: **`pt-16`** mobile, **`md:pt-20`** desktop
- Row cards: `rounded-xl`, `px-8 py-4`, vertical stack `space-y-3`

## Leaderboard grid (desktop)

7-column CSS grid (`LEADERBOARD_DESKTOP_GRID` in `leaderboardGrid.ts`), shared by header and rows with no column gap:

| Track | Column |
|-------|--------|
| `4.5rem` | Rank |
| `minmax(10rem, 1.6fr)` | Player details |
| `7.5rem` | Last 5 games (center) |
| `1fr` (×4 equal) | Win rate, Points, Last day, Trend — each centered |

Last day shows net rank score on the player’s most recent played date.

## Data display rules

- **Points** = real `rankScore` (typically one decimal). Do not inflate to mock-style large integers.
- **Last day** = sum of signed encounter scores on the player’s latest **played** date (`scoreBreakdown.finalScore` when present, else signed `calculatedScore`); `—` if none. Matches player history “Net Score” for that date.
- **Win rate** = percentage from encounter history (`XX.X%` or consistent decimal style).
- **Peak tenure chip** beside player name on the same row (context-sensitive): at personal best → compact tenure (`18d at peak`, `New peak`, or `At peak`); off peak → `Peak #N · Nd`. Parses days from the API `timeInHighestRank` string; full meaning in the chip’s `aria-label`.
- **Last 5** = five vertical ticks on every row: win `rgb(238 138 51)`, loss `rgb(185 28 28)`, empty `rgb(255 255 255 / 0.45)`; each bar has a `1px` dark ring (`rgb(0 0 0 / 0.45)`) for contrast on podium gradients.

## Loading

Use the shared racket loader from `src/components/common/GameLoader.tsx` — not ad-hoc spinners or DaisyUI `loading-spinner`.

| Piece | Usage |
|-------|--------|
| `PageLoader` | Full-page fetches: `variant` `compact` (40vh), `tall` (50vh), or `screen` (login / admin players) |
| `GameLoader` | Inline: `sm` (nav, buttons), `md` (modals), `lg` (inside `PageLoader`) |

Large loaders show a spinning racket (`motion="spin"`), orbiting shuttlecock, dashed court ring, and **Warming up…** (`font-label`, uppercase). Color via `text-primary` or `text-black` on orange buttons. For **live / in-play** badges (game viewer title chip), use `motion="rally"`: a short back-and-forth smash at the grip pivot — not a full spin. `prefers-reduced-motion` freezes animations in `globals.css`. Pass a specific `label` for `aria-label`; use `decorative` inside buttons that already show loading text.

## Do

- Dark-only public chrome; single visual system on rankings, player encounter history (`/player/{id}/encounters`), and shared nav/footer.
- Link player names to `/player/{id}/encounters`.
- Use Heroicons for crown, medal, trend (no Material Symbols dependency required).

## Don’t

- DaisyUI `table`, `stat`, or `alert-*` on public rankings or player encounter history pages.
- Invent nav items (Tournaments, Stats) or footer legal pages without real routes.
- Light/emerald theme toggle on restyled public chrome.
- Fake placeholder player or country data from the Stitch HTML.
