# ShuttleTrack public UI — design system

Dark, performance-oriented leaderboard aesthetic derived from the Stitch player-rankings mock. **Brand:** Dutch Lankan Shuttle Masters. Do not use placeholder names from the mock (e.g. COURTCLAN).

**Header:** Solid black band (`#000000` / `surface-header`), no gradient, no blur. Logo seated inside the bar — **desktop** `h-16` centered in a `h-20` band; **mobile** `h-12` centered in a `h-16` band. Active nav link uses an orange `border-b-2 border-primary` underline. **Footer:** full club name as italic wordmark.

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
- **Rank 4 (metallic dark):** `#2a3038` → `#1f242a` → `#16191d` + optional `.form-strip` overlay at 10% opacity
- **Rank 5+:** `bg-surface-container` (`#282828`)

### Utilities

- `.kinetic-gradient`: `linear-gradient(135deg, #EE8A33 0%, #F7B375 100%)`
- `.form-strip`: diagonal stripe pattern (primary at 5% opacity)

## Typography

| Role | Font | Tailwind |
|------|------|----------|
| Headlines | Manrope | `font-headline` |
| Body | Inter | `font-body` |
| Column labels | Space Grotesk | `font-label` |

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

12-column grid aligned with mock:

| Col span | Column |
|----------|--------|
| 1 | Rank |
| 4 | Player details |
| 2 | Last 5 games (center) |
| 2 | Win rate (center) |
| 2 | Points (right) |
| 1 | Trend (right) |

## Data display rules

- **Points** = real `rankScore` (typically one decimal). Do not inflate to mock-style large integers.
- **Win rate** = percentage from encounter history (`XX.X%` or consistent decimal style).
- **Subtitle** under player name = highest rank + time in highest rank (we have no country field).
- **Last 5** = five vertical ticks; filled = win, muted = loss.

## Do

- Dark-only public chrome; single visual system on rankings and shared nav/footer.
- Link player names to `/player/{id}/encounters`.
- Use Heroicons for crown, medal, trend (no Material Symbols dependency required).

## Don’t

- DaisyUI `table`, `stat`, or `alert-*` on the public leaderboard page.
- Invent nav items (Tournaments, Stats) or footer legal pages without real routes.
- Light/emerald theme toggle on restyled public chrome.
- Fake placeholder player or country data from the Stitch HTML.
