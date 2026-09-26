# Public ranking

One rating per person across every public squad. The site-root board (`/`) shows that rating. Each squad board (`/s/[slug]`) still uses that squad’s own Elo `rankScore`.

The public rating is **derived**. It is rebuilt from processed encounters whenever a public game is processed, a squad’s public flag or weight changes, or a superadmin hits **Recalculate public ratings** on `/platform/squads`. Do not edit `PublicRating` or `PublicRatingEvent` by hand.

Code: `frontend/src/lib/ranking/publicRating.ts` (pure math), `publicRatingRecalc.ts` (load and persist). Tests: `publicRating.test.ts`, `publicRatingRecalc.test.ts`, `publicRankings.test.ts`.

## Why it exists

Summing squad `rankScore`s put multi-squad players too high and treated every squad as equal. Seeding from a squad’s current standing also put hand-set first-day scores ahead of players who started tied. The public board is a separate replay:

1. Group players by lowercased email.
2. Seed each person once, from the weight of the squad where they first played a public match.
3. Replay every countable public match in date order with win/loss Elo, scaled by score margin and squad weight.
4. Dock consecutive missed public weeks with the same absentee amounts the squad boards use.

Squad membership never changes the number. It only decides who appears on the board and which name and squad chips they get. Someone with no processed public match has no row.

## Who is included

A squad contributes when it is `enabled` and `isPublic`. Each such squad has a `publicWeight` from 0 to 1 (default 0.5), set only by a platform superadmin.

A match counts when it is `processed` and the two scores sum to more than 0. Unprocessed games and 0–0 rows are skipped. Replay order is encounter date, then encounter id.

A person is the lowercased, trimmed email on `Player`. The same email in two squads is one rating. A player with a blank email is ignored. If one partner id on a team has no email, the known partner is used alone. A team with no known people skips the match.

## Seed

On a person’s first countable public match, and never again:

```
seed = 1500 + 500 × (w − 0.5)
```

| Weight | Seed |
|--------|------|
| 0.9 | 1700 |
| 0.5 | 1500 |
| 0.3 | 1400 |

Everyone who starts in the same squad starts equal. Later matches, including ones in a higher-weight squad, do not re-seed. A 300-point gap (1700 vs 1400) is about a 70% expected win for the higher seed (`E ≈ 0.703`, roughly a 21–9 favourite).

Squad `rankScore`, `playerRank`, and admin-set opening scores are not inputs.

## Match update

Doubles. Each side’s rating is the average of its players’ ratings at that moment.

**Expected win chance** (logistic Elo, divisor 800):

```
E = 1 / (1 + 10^((R_opp − R_team) / 800))
```

Equal ratings → `E = 0.5`. A 100-point edge is about 0.57. A 200-point edge is about 0.64.

**Result** is win/loss, not point share:

```
actual = 1 if this team’s score is higher, else 0
```

**Margin** scales how far the scoreline was from even. `higher` is the larger of the two scores:

```
mov = 1 + |point difference| / higher
```

21–19 is about 1.10. 21–15 is about 1.29. 21–5 is about 1.76. 21–0 is 2.

**Raw change** (`K = 16`):

```
raw = 16 × mov × (actual − E)
```

Winners get a positive raw value. Losers get a negative one. A blowout moves more than a close game.

**Squad weight** then scales that raw value. Gain rises with weight. Loss is softer than gain, and softer still at higher weights:

```
gain = (1 + w) / 2
loss = gain × (1 − w / 2)
delta = round(raw × gain, 2)   when raw > 0
delta = round(raw × loss, 2)   when raw ≤ 0
```

| Weight | Gain | Loss |
|--------|------|------|
| 0.9 | 0.95 | 0.5225 |
| 0.5 | 0.75 | 0.5625 |
| 0.3 | 0.65 | 0.5525 |

A win in a 0.9 squad is worth more than the same win in a 0.3 squad. A loss in a 0.9 squad costs about half of the matching gain (0.5225 / 0.95), not a token 5%. Both sides of an even match do not move by equal and opposite amounts, because gain and loss differ.

Worked examples, both sides at 1600:

| Squad weight | Score | Winner | Loser |
|--------------|-------|--------|-------|
| 0.9 | 21–15 | +9.77 | −5.37 |
| 0.9 | 21–5 | +13.39 | −7.36 |
| 0.3 | 21–15 | +6.69 | −5.68 |

The same delta is applied to every player on that team. Each player’s match count goes up by one.

## Inactivity

After each ISO week (Monday–Sunday) that already contains at least one countable public match, and only once that week is finished (`asOf` is on or after the next Monday):

- Anyone already seeded who played **no** public match that week, in any public squad, takes the next demerit.
- One match anywhere that week clears the streak (`missedWeeks = 0`) and costs nothing.
- A week where nobody played is not a public game week, so it costs nothing.
- The current, unfinished week is never docked.

Amounts match the squad absentee ladder (`DEMERIT_POINTS_ABSENTEE` and `absenteeMultiplierForSpell` in `absenteeManager.ts`):

| Consecutive missed public weeks | Change |
|---------------------------------|--------|
| 1 | −10 |
| 2 | −20 |
| 3 or more | −30 each |

There is no rating floor and no auto-deactivation. Squad `ScoreHistory` absentee rows are not copied in: a person who skips one squad while playing another that same week should not be docked.

## Storage and rebuild

`recalculatePublicRatings()` loads every processed encounter from enabled public squads, runs `replayPublicRatings`, and replaces both tables in one transaction:

- **`PublicRating`** — one row per email: `rating`, `seed`, `matches`, `lastPlayed`, `missedWeeks`.
- **`PublicRatingEvent`** — one row per change: `SEED` (delta 0), `MATCH`, or `INACTIVITY`, with the inputs in `details`.

The rebuild is always full. Seed and the inactivity ladder depend on the whole history, and a weight change re-scores every past match. One run at a time (in-process lock; the app is a single container).

Triggers:

- Process a game (`POST /api/squads/[squadId]/games/[id]/process`), after the game is `COMPLETED`.
- `PATCH` squad settings when `enabled` or `publicWeight` is sent.
- `PATCH` squad visibility.
- Superadmin **Recalculate public ratings** (`POST /api/platform/public-ratings`). Use this after deploy, and after an email change or player delete, which do not trigger a rebuild on their own.

Automatic triggers are non-fatal. The squad action has already succeeded; the button repairs the tables.

## What the public board shows

`buildPublicRankingsFromMemberships` keeps a person who is board-visible in at least one public squad **and** has a stored public rating. The sort key is that rating.

The name, squad chips, and primary membership (highest squad `rankScore`, then `playerRank`) come from squad rows. Form (wins, losses) is combined across that person’s public-squad player ids. The number on the board is never a squad `rankScore`.

On pages a visitor can open without signing in, names render as first name plus the first letter of the second name (`Nishan Karunarathna` → `Nishan K`). Stored `Player.name` is unchanged. Admin and signed-in tools still show the full name. See `publicDisplayName` in `frontend/src/utils/string.ts`.

## Constants

| Name | Value | Role |
|------|-------|------|
| `K` | 16 | Elo step before margin and weight |
| `DIVISOR` | 800 | Rating gap in the expected-win curve |
| `SEED_BASE` | 1500 | Seed at weight 0.5 |
| `WEIGHT_SPREAD` | 500 | How far seed moves per unit of weight away from 0.5 |

Changing `K`, `DIVISOR`, `SEED_BASE`, `WEIGHT_SPREAD`, the absentee amounts, or any squad’s `publicWeight` changes history. The next recalculation applies it.
