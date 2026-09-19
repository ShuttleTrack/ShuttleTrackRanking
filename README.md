# Badminton Ranking System (BRS)

A web application for managing badminton player rankings and matches.

## Features

- Player ranking management
- Match history tracking
- Score calculation
- Google SSO authentication
- Admin dashboard for managing games and players
- Real-time match score keeping
- Player statistics and performance tracking

## Tech Stack

- Next.js (Pages Router) + TypeScript
- Tailwind CSS + DaisyUI
- Prisma + MySQL
- NextAuth (Google SSO)
- GitHub Actions (CI)

See `CLAUDE.md` for a fuller architecture overview, and `MIGRATION_PLAN.md` for the history of how this consolidated from an earlier two-app (Java + Next.js) setup into a single Next.js app.

## Development

### Prerequisites
- Node.js 20+
- MySQL 8+
- Docker & Docker Compose (optional, for a local MySQL instance)

### Local Setup
1. Clone the repository
2. `cd frontend && cp .env.example .env`, fill in the values
3. Start MySQL (however you prefer - Docker, a local install, etc.)
4. `npm install`
5. `npx prisma generate`
6. `npm run dev`

## License

MIT License

## Contributors

- [Amila Banuka](https://github.com/amilabanuka)
- [Nishan Karunarathna](https://github.com/digitizelab)
- [Sudheera Palihakkara](https://github.com/catchsudheera)
