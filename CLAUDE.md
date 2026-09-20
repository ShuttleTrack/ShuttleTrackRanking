# CLAUDE.md

Guidance for working in this repository (Badminton Ranking System / "BRS" — internally also "ShuttleTrack").

## What this is

A web app that maintains a badminton **doubles ranking** for one or more independent friend groups ("squads") sharing one deployment. On a game day, available players (within one squad) are grouped by skill tier, every pair within a group plays each other, and match outcomes feed an Elo-style rank-score calculation that updates the standing ranking. See `frontend/docs/squad-tenancy.md` for the full multi-squad model - **keep that doc updated** whenever you change squad data model, auth, routing, or squad-level features; this file only gives the high-level pointer.

## Architecture

**One app: `frontend/`** — Next.js (Pages Router) + TypeScript + Tailwind + DaisyUI + Prisma/MySQL. This is now the entire system: the admin UI for running game days and score keeping, the public ranking/history views, the API routes, *and* the ranking-math/domain logic, all in one Next.js deployment. Persists directly to MySQL (the `brs` schema) via Prisma — no separate backend service. Auth is NextAuth (Google SSO) plus a local platform-superadmin email list, per-squad `SquadAdmin`/`Player` lookups (`frontend/src/lib/auth/`, `frontend/docs/squad-tenancy.md`).

There used to be a second, independently-deployed Java/Spring Boot service (`backend/`) that owned players/encounters/rankings/score-calculation, with the frontend proxying to it. It was fully migrated into this Next.js app and then deleted from the repo — see `MIGRATION_PLAN.md` for the full history of that migration (why, how, and the fidelity decisions made porting the ranking math over). If you're looking for "the backend," there isn't one anymore; it's `frontend/src/lib/ranking/`, `frontend/src/lib/auth/`, and `frontend/src/lib/telegram/`.

There also used to be an Ansible-playbook deployment setup (`deployment/`) for running both services behind SWAG/Cloudflare - also deleted. It was already confirmed stale/not what's actually deployed before removal (the real deployment is managed directly, e.g. via Portainer, outside this repo).

### Where things live now

- **Squad tenancy** (the `Squad`/`SquadAdmin` model, per-squad auth, `/s/[squad]/**` + `/api/squads/[squadId]/**` routing): see `frontend/docs/squad-tenancy.md` for the full picture. In brief: `frontend/src/lib/squads*`-adjacent code (`lib/auth/squadAccess.ts`, `lib/squadPage.ts`, `lib/squadSchedule.ts`), `contexts/SquadContext.tsx`, `pages/platform/squads.tsx`.
- **Ranking math** (Elo calculation, absentee demerits, player activation, team-id encoding): `frontend/src/lib/ranking/{eloCalculator,scorePersister,absenteeManager,activation,playerUtil,round}.ts`, orchestrated by `players.ts`, `encounters.ts`, and `processEncounters.ts` - all squad-scoped (every query takes a `squadId`), but the math itself is squad-agnostic and untouched by the tenancy work.
- **Auth** (Google ID token verification, superadmin-email check, per-squad admin/player resolution): `frontend/src/lib/auth/`.
- **Telegram scheduler** (the daily "who's in" poll): `frontend/src/lib/telegram/`, registered via `frontend/src/instrumentation.ts` (an in-process `node-cron` job, since this deploys as a long-running container, not serverless). Still a single global job, not per-squad-configurable (see `frontend/docs/squad-tenancy.md`'s out-of-scope list).
- **API routes**: `frontend/src/pages/api/squads/[squadId]/**` call the `lib/` functions above directly - no `fetch(NEXT_PUBLIC_BACKEND_URL + ...)` anywhere anymore. The old flat `frontend/src/pages/api/local/**` scaffold mentioned in earlier versions of this doc has been deleted (it was vestigial from the Java-backend migration and never wired to anything by the time squad tenancy landed).
- **`Game` table** (Prisma, in the same `brs` MySQL schema): scratch state for an in-progress game day (groups + live scores as JSON, plus a `squadId`). A game lives in this table while being played (`DRAFT` → `IN_PROGRESS` → `COMPLETED` once processed) - it is **not** authoritative ranking data. `Player`/`Encounter`/`ScoreHistory` (also Prisma models in the same schema) are the real, permanent ranking/encounter history.

## Core domain flow (game day)

All of this is now squad-scoped - every page below lives under `pages/s/[squad]/admin/` and every API route under `pages/api/squads/[squadId]/`.

1. **Game Planner** (`pages/s/[squad]/admin/game-planner.tsx`) — admin picks available players (4–20, counts must form groups of 4–5) from that squad's roster. `calculateGroupDistribution()` decides group sizes; players are sliced into groups **in rank order** (each group is a skill tier). Creates a `Game` (status `DRAFT`) tagged with the squad's id.
2. **Game Day** (`pages/s/[squad]/admin/game-day.tsx`) — shows the resulting groups.
3. **Score Keeper** (`pages/s/[squad]/admin/score-keeper.tsx`) — "Start Games" → `IN_PROGRESS`; admin records each match score (round-robin pairings from `utils/match.ts`); "Submit" (`pages/api/squads/[squadId]/games/[id]/submit.ts`) persists each match as an `Encounter` row via `lib/ranking/processEncounters.addEncounter`; "Process" (`pages/api/squads/[squadId]/games/[id]/process.ts`) runs the ranking calc for the day via `processEncountersForDate` (Elo for every unprocessed encounter in that squad, absentee demerits for everyone in that squad who didn't play, re-rank), then marks the `Game` `COMPLETED`.

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
- Example for non-ranking logic: `src/game-planner.logic.test.ts` covers the group-distribution logic (imports `calculateGroupDistribution` from `pages/s/[squad]/admin/game-planner.tsx`).

## Conventions & gotchas

- **Path alias:** `@/*` → `frontend/src/*` (tsconfig + vitest both configured).
- **Frontend routing:** Pages Router (`src/pages/`), not the App Router. There is a stray `src/app/` dir but pages live under `src/pages`.
- **Admin actions are password-gated** on the client via `utils/password.ts` (editing scores, submitting, cancelling) — this is a UI guard, not real authz; `requireSquadAdmin`/`requireSuperAdmin` (`src/lib/auth.ts`) plus each admin page's `getServerSideProps` (`resolveSquadAdminOrRedirect`, `src/lib/squadPage.ts`) are the real boundary. See `frontend/docs/squad-tenancy.md`.
- **Group sizes are deterministic per day:** `calculateGroupDistribution(total, seed)` fixes the size *composition* by player count and shuffles their *order* with a date-seeded PRNG, so recreating a game the same day can't re-roll the grouping.
- Some ranking-math behavior deliberately preserves quirks/bugs from the original Java implementation rather than "fixing" them during the port - e.g. `lib/ranking/period.ts`'s `timeInHighestRank` label uses the same (arguably buggy) day-component-only date math the original did. Check the comments in `lib/ranking/` before "fixing" something that looks odd; it may be intentional fidelity, not a bug introduced by the port.

## Don't

- Don't commit or push unless asked.
- Don't treat the `Game` table as authoritative ranking data; it's throwaway session state.
- Don't assume there's a separate backend to call - there isn't anymore.
- Don't change squad data model, auth, routing, or any squad-level feature (settings, schedule, etc.) without updating `frontend/docs/squad-tenancy.md` in the same change - it's the living reference for the multi-squad model, and it goes stale (like this file periodically has) if edits don't keep it in sync.
