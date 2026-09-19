# CLAUDE.md

Guidance for working in this repository (Badminton Ranking System / "BRS" — internally also "ShuttleTrack").

## What this is

A web app that maintains a badminton **doubles ranking** for a friends group. On a game day, available players are grouped by skill tier, every pair within a group plays each other, and match outcomes feed an Elo-style rank-score calculation that updates the standing ranking.

## Architecture

**One app: `frontend/`** — Next.js (Pages Router) + TypeScript + Tailwind + DaisyUI + Prisma/MySQL. This is now the entire system: the admin UI for running game days and score keeping, the public ranking/history views, the API routes, *and* the ranking-math/domain logic, all in one Next.js deployment. Persists directly to MySQL (the `brs` schema) via Prisma — no separate backend service. Auth is NextAuth (Google SSO) plus a local admin-email-list + `Player`-row lookup (`frontend/src/lib/auth/`).

There used to be a second, independently-deployed Java/Spring Boot service (`backend/`) that owned players/encounters/rankings/score-calculation, with the frontend proxying to it. It was fully migrated into this Next.js app and then deleted from the repo — see `MIGRATION_PLAN.md` for the full history of that migration (why, how, and the fidelity decisions made porting the ranking math over). If you're looking for "the backend," there isn't one anymore; it's `frontend/src/lib/ranking/`, `frontend/src/lib/auth/`, and `frontend/src/lib/telegram/`.

There also used to be an Ansible-playbook deployment setup (`deployment/`) for running both services behind SWAG/Cloudflare - also deleted. It was already confirmed stale/not what's actually deployed before removal (the real deployment is managed directly, e.g. via Portainer, outside this repo).

### Where things live now

- **Ranking math** (Elo calculation, absentee demerits, player activation, team-id encoding): `frontend/src/lib/ranking/{eloCalculator,scorePersister,absenteeManager,activation,playerUtil,round}.ts`, orchestrated by `players.ts`, `encounters.ts`, and `processEncounters.ts`.
- **Auth** (Google ID token verification, admin-email check, `Player` lookup): `frontend/src/lib/auth/`.
- **Telegram scheduler** (the daily "who's in" poll): `frontend/src/lib/telegram/`, registered via `frontend/src/instrumentation.ts` (an in-process `node-cron` job, since this deploys as a long-running container, not serverless).
- **API routes**: `frontend/src/pages/api/**` call the above directly now - no `fetch(NEXT_PUBLIC_BACKEND_URL + ...)` anywhere anymore. Note: `frontend/src/pages/api/local/**` is now **vestigial** - it was built as a safe, parallel/unwired scaffold during the migration (so the real routes could be swapped over one at a time without risk) and duplicates logic the "real" routes now call directly. Worth cleaning up/removing in a future pass; not done yet.
- **`Game` table** (Prisma, in the same `brs` MySQL schema): scratch state for an in-progress game day (groups + live scores as JSON). A game lives in this table while being played (`DRAFT` → `IN_PROGRESS` → `COMPLETED` once processed) - it is **not** authoritative ranking data. `Player`/`Encounter`/`ScoreHistory` (also Prisma models in the same schema) are the real, permanent ranking/encounter history.

## Core domain flow (game day)

1. **Game Planner** (`pages/admin/game-planner.tsx`) — admin picks available players (4–20, counts must form groups of 4–5). `calculateGroupDistribution()` decides group sizes; players are sliced into groups **in rank order** (each group is a skill tier). Creates a `Game` (status `DRAFT`).
2. **Game Day** (`pages/admin/game-day.tsx`) — shows the resulting groups.
3. **Score Keeper** (`pages/admin/score-keeper.tsx`) — "Start Games" → `IN_PROGRESS`; admin records each match score (round-robin pairings from `utils/match.ts`); "Submit" (`pages/api/games/[id]/submit.ts`) persists each match as an `Encounter` row via `lib/ranking/processEncounters.addEncounter`; "Process" (`pages/api/games/[id]/process.ts`) runs the ranking calc for the day via `processEncountersForDate` (Elo for every unprocessed encounter, absentee demerits for everyone who didn't play, re-rank), then marks the `Game` `COMPLETED`.

Player eligibility + game-day rank ordering is `lib/ranking/players.getAvailablePlayersForGame()` + `lib/ranking/playerUtil.getRankedPlayers()` (sort by `rankScore` desc, `playerRank` asc as tiebreak).

## Commands (`cd frontend`)
```bash
npm run dev          # dev server on :3000
npm run build         # production build
npm run lint           # next lint
npm test                # vitest (run once)
npm run test:watch      # vitest watch mode
npx prisma generate      # regenerate Prisma client after schema changes
npx prisma db push        # push schema.prisma changes to the DB (no migration history for this schema - see MIGRATION_PLAN.md Phase 1)
```

## Testing

- **Vitest** (`vitest.config.ts`, jsdom env, `@` → `src` alias). Test files are co-located as `*.test.ts` / `*.test.tsx` under `src/`.
- `src/lib/ranking/characterization.test.ts` is the important one for the ranking math: it asserts the ported Elo/absentee/activation logic reproduces `__fixtures__/characterization.json` - real captured output from the original Java implementation - bit-for-bit. That fixture is frozen history now (the Java source it was captured from no longer exists in this repo); treat it as the oracle for ranking-math correctness, not something to regenerate.
- Example for non-ranking logic: `src/pages/admin/game-planner.test.ts` covers the group-distribution logic.

## Conventions & gotchas

- **Path alias:** `@/*` → `frontend/src/*` (tsconfig + vitest both configured).
- **Frontend routing:** Pages Router (`src/pages/`), not the App Router. There is a stray `src/app/` dir but pages live under `src/pages`.
- **Admin actions are password-gated** on the client via `utils/password.ts` (editing scores, submitting, cancelling) — this is a UI guard, not real authz; `requireAuth`'s NextAuth-session `isAdmin` check (`src/lib/auth.ts`) is the real boundary.
- **Group sizes are deterministic per day:** `calculateGroupDistribution(total, seed)` fixes the size *composition* by player count and shuffles their *order* with a date-seeded PRNG, so recreating a game the same day can't re-roll the grouping.
- **`frontend/src/pages/api/local/**` is vestigial** (see above) - don't be confused into thinking it's a still-in-progress parallel implementation; the real routes already call the same underlying `lib/` functions.
- Some ranking-math behavior deliberately preserves quirks/bugs from the original Java implementation rather than "fixing" them during the port - e.g. `lib/ranking/period.ts`'s `timeInHighestRank` label uses the same (arguably buggy) day-component-only date math the original did. Check the comments in `lib/ranking/` before "fixing" something that looks odd; it may be intentional fidelity, not a bug introduced by the port.

## Don't

- Don't commit or push unless asked.
- Don't treat the `Game` table as authoritative ranking data; it's throwaway session state.
- Don't assume there's a separate backend to call - there isn't anymore.
