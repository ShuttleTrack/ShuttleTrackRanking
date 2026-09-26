# CLAUDE.md

Guidance for working in this repository (Badminton Ranking System / "BRS" — internally also "ShuttleTrack").

## What this is

A web app that maintains a badminton **doubles ranking** for one or more independent friend groups ("squads") sharing one deployment. On a game day, available players (within one squad) are grouped by skill tier, every pair within a group plays each other, and match outcomes feed an Elo-style rank-score calculation that updates the standing ranking. See `frontend/docs/squad-tenancy.md` for the full multi-squad model - **keep that doc updated** whenever you change squad data model, auth, routing, or squad-level features; this file only gives the high-level pointer.

## Architecture

**One app: `frontend/`** — Next.js (Pages Router) + TypeScript + Tailwind + DaisyUI + Prisma/MySQL. This is now the entire system: the admin UI for running game days and score keeping, the public ranking/history views, the API routes, *and* the ranking-math/domain logic, all in one Next.js deployment. Persists directly to MySQL (the `brs` schema) via Prisma — no separate backend service. Auth is NextAuth (Google SSO) plus a local platform-superadmin email list, per-squad `SquadAdmin`/`Player` lookups (`frontend/src/lib/auth/`, `frontend/docs/squad-tenancy.md`).

There used to be a second, independently-deployed Java/Spring Boot service (`backend/`) that owned players/encounters/rankings/score-calculation, with the frontend proxying to it. It was fully migrated into this Next.js app and then deleted from the repo — see `MIGRATION_PLAN.md` for the full history of that migration (why, how, and the fidelity decisions made porting the ranking math over). If you're looking for "the backend," there isn't one anymore; it's `frontend/src/lib/ranking/`, `frontend/src/lib/auth/`, and `frontend/src/lib/gameDay/`.

There also used to be an Ansible-playbook deployment setup (`deployment/`) for running both services behind SWAG/Cloudflare - also deleted. It was already confirmed stale/not what's actually deployed before removal (the real deployment is managed directly, e.g. via Portainer, outside this repo).

### Where things live now

- **Squad tenancy** (the `Squad`/`SquadAdmin` model, per-squad auth, `/s/[squad]/**` + `/api/squads/[squadId]/**` routing): see `frontend/docs/squad-tenancy.md` for the full picture. In brief: `frontend/src/lib/squads*`-adjacent code (`lib/auth/squadAccess.ts`, `lib/squadPage.ts`, `lib/squadSchedule.ts`), `contexts/SquadContext.tsx`, `pages/platform/squads.tsx`.
- **Ranking math** (Elo calculation, absentee demerits, player activation, team-id encoding): `frontend/src/lib/ranking/{eloCalculator,scorePersister,absenteeManager,activation,playerUtil,round}.ts`, orchestrated by `players.ts`, `encounters.ts`, and `processEncounters.ts` - all squad-scoped (every query takes a `squadId`), but the math itself is squad-agnostic and untouched by the tenancy work.
- **Auth** (Google ID token verification, superadmin-email check, per-squad admin/player resolution): `frontend/src/lib/auth/`.
- **Telegram**: `frontend/src/lib/telegram/sendMessage.ts` is the plain-fetch Bot API sender used by the game-day check-in and the score keeper's game notifications (`pages/api/squads/[squadId]/notify.ts`); both send to the squad's own chat ids from `Squad.gameDayOps`. The old global 17:00 "who's in" poll cron (ported from the Java backend) has been removed - the game-day check-in replaced it.
- **Game-day check-in** (attendance vote, open-slot waiting list, per-squad Telegram posts): `frontend/src/lib/gameDay/`, with an every-5-minutes cron registered in `frontend/src/instrumentation.ts` (an in-process `node-cron` job, since this deploys as a long-running container, not serverless). Pure decision logic (`clock.ts`, `voteWindow.ts`, `counts.ts`, `votes.ts`'s `evaluateVote`, `scheduler.ts`'s `decide*`) is kept separate from the Prisma paths; the tests run the Prisma paths against a stateful fake (`lib/gameDay/testing/fakePrisma.ts`).
- **API routes**: `frontend/src/pages/api/squads/[squadId]/**` call the `lib/` functions above directly - no `fetch(NEXT_PUBLIC_BACKEND_URL + ...)` anywhere anymore. The old flat `frontend/src/pages/api/local/**` scaffold mentioned in earlier versions of this doc has been deleted (it was vestigial from the Java-backend migration and never wired to anything by the time squad tenancy landed).
- **`Game` table** (Prisma, in the same `brs` MySQL schema): scratch state for an in-progress game day (groups + live scores as JSON, plus a `squadId`). A game lives in this table while being played (`DRAFT` → `IN_PROGRESS` → `COMPLETED` once processed) - it is **not** authoritative ranking data. `Player`/`Encounter`/`ScoreHistory` (also Prisma models in the same schema) are the real, permanent ranking/encounter history.
- **`PublicRating` / `PublicRatingEvent` tables**: the site-root public leaderboard's one-rating-per-email across public squads (weighted by the superadmin-set `Squad.publicWeight`). Also **derived, not authoritative** - rebuilt wholesale from processed `Encounter`s by `lib/ranking/publicRatingRecalc.ts` after every Process, weight/visibility change, or the superadmin Recalculate button on `/platform/squads`. Rules in `lib/ranking/publicRating.ts` and `frontend/docs/squad-tenancy.md` ("Public leaderboard rating").

## Core domain flow (game day)

All of this is now squad-scoped - every page below lives under `pages/s/[squad]/admin/` and every API route under `pages/api/squads/[squadId]/`.

0. **Attendance vote** (squads with `gameDayOps` enabled; `ATTENDANCE_VOTE_PLAN.md`, `lib/gameDay/`) — the flow now starts two days ahead, not at Game Planner: a 5-minute scheduler creates a `GameDay` from the squad's schedule, players vote in/out at `/s/[squad]/game-day/[date]`, open-slot players queue, and at 13:00 voting closes and the waiting list fills the gap. Game Planner then opens with the confirmed players pre-ticked. See `frontend/docs/squad-tenancy.md`.
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
```

## Prisma schema & migrations

Schema changes are **incremental Prisma migrations**, not ad-hoc SQL or `db push`. The live MySQL schema is the `brs` database; `prisma/schema.prisma` and `prisma/migrations/<timestamp>_<name>/migration.sql` must stay in sync.

**Apply migrations** (local compose, existing production-like DBs):

```bash
node scripts/prisma-migrate-deploy.mjs   # baselines init if Game exists but init was never recorded, then migrate deploy
```

On a truly empty schema you can use `npx prisma migrate deploy` directly. Confirm no drift afterward (`--exit-code`: 0 means in sync):

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code
```

**Add a schema change:**

1. Edit `schema.prisma`.
2. Generate SQL: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (requires `--shadow-database-url` pointing at a disposable empty MySQL schema, or diff against a scratch DB with ` --from-url` instead).
3. Add `prisma/migrations/<YYYYMMDDHHMMSS>_<short_name>/migration.sql` with that SQL, adjusted for **existing data** when needed: add new columns nullable first, `UPDATE` to backfill, then `MODIFY NOT NULL` / unique indexes / foreign keys in the same file. MySQL has no `ADD COLUMN IF NOT EXISTS`; use `information_schema` checks + `PREPARE`/`EXECUTE` if the migration must be safe on DBs that already partially match (see `20250921120000_align_live_schema`).
4. Apply with `node scripts/prisma-migrate-deploy.mjs` and re-run the drift check above.
5. If the change is squad-related, update `frontend/docs/squad-tenancy.md` in the same PR.

**Rules:**

- **Always additive:** never edit or delete a migration already recorded in `_prisma_migrations`. Never squash history. New work = a new timestamped folder (`20250202125811_init` stays forever).
- **Assume populated tables:** no `DROP TABLE` / `DROP DATABASE`. No `prisma migrate reset` except on a throwaway local scratch DB.
- **`prisma migrate resolve --applied`** only to record history that is already true of the schema (`prisma-migrate-deploy.mjs` baselines `20250202125811_init` when `Game` or `PLAYER`/`ENCOUNTER`/`SCORE_HISTORY` exist without `_prisma_migrations`). Never use it to skip a migration that has not actually been applied.

## Testing

- **Vitest** (`vitest.config.ts`, jsdom env, `@` → `src` alias). Test files are co-located as `*.test.ts` / `*.test.tsx` under `src/`.
- `src/lib/ranking/characterization.test.ts` is the important one for the ranking math: it asserts the ported Elo/absentee/activation logic reproduces `__fixtures__/characterization.json` - real captured output from the original Java implementation - bit-for-bit. That fixture is frozen history now (the Java source it was captured from no longer exists in this repo); treat it as the oracle for ranking-math correctness, not something to regenerate.
- Example for non-ranking logic: `src/game-planner.logic.test.ts` covers the group-distribution logic (imports `calculateGroupDistribution` from `pages/s/[squad]/admin/game-planner.tsx`).

## Conventions & gotchas

- **Path alias:** `@/*` → `frontend/src/*` (tsconfig + vitest both configured).
- **Frontend routing:** Pages Router (`src/pages/`), not the App Router. There is a stray `src/app/` dir but pages live under `src/pages`.
- **Admin actions are password-gated** on the client via `utils/password.ts` (editing scores, submitting, cancelling) — this is a UI guard, not real authz; `requireSquadAdmin`/`requireSuperAdmin` (`src/lib/auth.ts`) plus each admin page's `getServerSideProps` (`resolveSquadAdminOrRedirect`, `src/lib/squadPage.ts`) are the real boundary. See `frontend/docs/squad-tenancy.md`.
- **Group size order is random:** `calculateGroupDistribution(total, rng = Math.random)` fixes the size *composition* by player count and randomly shuffles their *order* on every call, so recreating a game can produce a different grouping.
- Some ranking-math behavior deliberately preserves quirks/bugs from the original Java implementation rather than "fixing" them during the port - e.g. `lib/ranking/period.ts`'s `timeInHighestRank` label uses the same (arguably buggy) day-component-only date math the original did. Check the comments in `lib/ranking/` before "fixing" something that looks odd; it may be intentional fidelity, not a bug introduced by the port.

## Don't

- Don't commit or push unless asked.
- Don't treat the `Game` table as authoritative ranking data; it's throwaway session state. Same for `PublicRating`/`PublicRatingEvent` - never edit them by hand; recalculate instead.
- Don't assume there's a separate backend to call - there isn't anymore.
- Don't change squad data model, auth, routing, or any squad-level feature (settings, schedule, etc.) without updating `frontend/docs/squad-tenancy.md` in the same change - it's the living reference for the multi-squad model, and it goes stale (like this file periodically has) if edits don't keep it in sync.
- Don't use `prisma db push` for schema changes (it mutates the DB without writing `_prisma_migrations`).
- Don't run `prisma migrate dev` against shared or production databases; it can prompt to reset data.
- Don't rewrite SQL in a migration that may already be applied.
