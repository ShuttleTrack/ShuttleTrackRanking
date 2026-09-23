import type { NextApiRequest, NextApiResponse } from 'next';
import type { GameDay } from '@prisma/client';
import { findGameDay, parseGameDateParam } from '@/lib/gameDay/view';

// The `[date]` segment of /api/squads/[squadId]/game-days/[date]/** (ATTENDANCE_VOTE_PLAN.md):
// YYYY-MM-DD or a 400 before the database is touched, then resolved by (squadId, gameDate). A
// valid date with no row is a 404 - which is also what a guessed URL for a non-playing day gets.
export async function resolveGameDayParam(
  req: NextApiRequest,
  res: NextApiResponse,
  squadId: number
): Promise<GameDay | null> {
  const gameDate = parseGameDateParam(req.query.date);
  if (!gameDate) {
    res.status(400).json({ message: 'The game date must be YYYY-MM-DD' });
    return null;
  }
  const gameDay = await findGameDay(squadId, gameDate);
  if (!gameDay) {
    res.status(404).json({ message: 'No game day on that date' });
    return null;
  }
  return gameDay;
}
