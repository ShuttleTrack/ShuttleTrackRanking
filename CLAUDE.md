# CLAUDE.md

Guidance for working in this repository (Badminton Ranking System / "BRS" — internally also "ShuttleTrack").

## What this is

A web app that maintains a badminton **doubles ranking** for a friends group. On a game day, available players are grouped by skill tier, every pair within a group plays each other, and match outcomes feed an Elo-style rank-score calculation that updates the standing ranking.

## Architecture

Two independently deployed apps plus infra:

- **`backend/`** — Java 21 + Spring Boot. Source of truth for players, encounters, rankings, and score calculation. Persists to **MySQL**. Exposes a REST API (Swagger at `http://localhost:8080/swagger-ui/index.html`). Auth is hybrid: Google SSO (for the frontend) + API key.
- **`frontend/`** — Next.js (Pages Router) + TypeScript + Tailwind + DaisyUI. Admin UI for running game days and score keeping, plus public ranking/history views. Uses **NextAuth** (Google) for sessions.
- **`deployment/`** — Ansible playbook deploying both as Docker containers behind SWAG (NGINX) with Cloudflare DNS.

> Note: the root `README.md` mentions Gradle, but the backend actually builds with **Maven** (`pom.xml` / `mvnw`). Trust the commands below.

### How the two talk

The frontend has its own thin API layer under `frontend/src/pages/api/**` that mostly **proxies** to the backend (`process.env.NEXT_PUBLIC_BACKEND_URL`), attaching the NextAuth `accessToken` as a bearer token. Example: `pages/api/game/players.ts` → backend `GET /v2/game/players`.

The frontend **also has its own database**: a Prisma/MySQL `Game` table (`frontend/prisma/schema.prisma`) used as scratch state for an in-progress game day (groups + live scores as JSON). A game lives in the frontend DB while being played (`DRAFT` → `IN_PROGRESS`), and on submit/process its results are pushed to the backend and the local `Game` row is deleted. So: **frontend `Game` = transient game-day session; backend = permanent ranking/encounter history.**

## Core domain flow (game day)

1. **Game Planner** (`pages/admin/game-planner.tsx`) — admin picks available players (4–20, counts must form groups of 4–5). `calculateGroupDistribution()` decides group sizes; players are sliced into groups **in rank order** (each group is a skill tier). Creates a `Game` (status `DRAFT`).
2. **Game Day** (`pages/admin/game-day.tsx`) — shows the resulting groups.
3. **Score Keeper** (`pages/admin/score-keeper.tsx`) — "Start Games" → `IN_PROGRESS`; admin records each match score (round-robin pairings from `utils/match.ts`); "Submit" → push to backend → "Process" runs ranking calc, then deletes the local game.

Ranking math lives in the backend `core/` package (`EloRankScoreCalculator`, `ScorePersister`, etc.). Player eligibility + game-day rank ordering is `GameService.getAvailablePlayersForGame()` + `PlayerUtil.getRankedPlayers()` (sort by `rankScore` desc, `playerRank` asc as tiebreak).

## Commands

### Frontend (`cd frontend`)
```bash
npm run dev          # dev server on :3000
npm run build        # production build
npm run lint         # next lint
npm test             # vitest (run once)
npm run test:watch   # vitest watch mode
npx prisma generate  # regenerate Prisma client after schema changes
```

### Backend (`cd backend`)
```bash
./mvnw spring-boot:run   # run locally (needs MySQL; see local-run/docker-compose.yml)
./mvnw test              # run tests
./mvnw package           # build jar
```

## Testing

- Frontend uses **Vitest** (`vitest.config.ts`, jsdom env, `@` → `src` alias). Test files are co-located as `*.test.ts` / `*.test.tsx` under `src/`.
- Example: `src/pages/admin/game-planner.test.ts` covers the group-distribution logic.

## Conventions & gotchas

- **Path alias:** `@/*` → `frontend/src/*` (tsconfig + vitest both configured).
- **Frontend routing:** Pages Router (`src/pages/`), not the App Router. There is a token `src/app/` dir but pages live under `src/pages`.
- **Admin actions are password-gated** on the client via `utils/password.ts` (editing scores, submitting, cancelling) — this is a UI guard, not real authz; the backend bearer token is the real boundary.
- **Group sizes are deterministic per day:** `calculateGroupDistribution(total, seed)` fixes the size *composition* by player count and shuffles their *order* with a date-seeded PRNG, so recreating a game the same day can't re-roll the grouping.
- Two backend `Constants` classes exist (`common/` and `util/`) — check which one you mean.
- API versioning: newer backend endpoints are under `/v2/...`.

## Don't

- Don't commit or push unless asked.
- Don't assume Gradle — it's Maven.
- Don't treat the frontend `Game` table as authoritative ranking data; it's throwaway session state.
