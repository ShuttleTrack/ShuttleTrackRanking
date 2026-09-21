// The public squad directory behind /squads/browse (SELF_REGISTRATION_PLAN.md): which squads are
// accepting join requests, and where this caller already stands with each of them.
//
// Resolving the caller's state here rather than client-side keeps the browse page to one fetch
// instead of an N+1 across every listed squad.
import { JoinRequestStatus, PlayerType } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isActive } from '@/lib/ranking/playerStatus';
import type { SquadScheduleData } from '@/lib/squadSchedule';

export type DirectoryMembership =
  | 'none'
  | 'pending'
  | 'member'
  // On the roster but deactivated. Kept distinct from 'member' so the card can say so: any
  // Player row counts as membership everywhere in this app (getSquadsForEmail, getSquadAccess),
  // so a deactivated person can't self-re-apply, and telling them "You're a member" for a squad
  // they were removed from would be actively confusing. Reactivation is an admin action on the
  // existing row - see SELF_REGISTRATION_PLAN.md.
  | 'memberInactive';

export interface DirectorySquad {
  id: number;
  name: string;
  slug: string;
  playerCount: number;
  // Shown against maxPlayers, which caps the FULLTIME roster only. The total above is displayed
  // separately - comparing a total against a fulltime-only cap would misreport how full a squad
  // actually is.
  fulltimePlayerCount: number;
  maxPlayers: number | null;
  scheduleSummary: string | null;
  membership: DirectoryMembership;
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Mondays',
  TUESDAY: 'Tuesdays',
  WEDNESDAY: 'Wednesdays',
  THURSDAY: 'Thursdays',
  FRIDAY: 'Fridays',
  SATURDAY: 'Saturdays',
  SUNDAY: 'Sundays',
};

// Squad.schedule is nullable and may carry isRecurring: false, so every caller needs an explicit
// empty state rather than a blank line. Returns null and lets the UI render its own wording.
export function formatScheduleSummary(schedule: unknown): string | null {
  const data = schedule as SquadScheduleData | null;
  if (!data || !data.isRecurring || !data.dayOfWeek) return null;

  const day = DAY_LABELS[data.dayOfWeek] ?? data.dayOfWeek;
  if (data.startTime && data.endTime) return `${day} ${data.startTime}–${data.endTime}`;
  if (data.startTime) return `${day} from ${data.startTime}`;
  return day;
}

// Every squad open to join requests, with this caller's standing in each.
export async function listOpenSquads(actorEmail: string): Promise<DirectorySquad[]> {
  const email = actorEmail.trim().toLowerCase();

  const squads = await prisma.squad.findMany({
    where: { enabled: true, openForOpenSlot: true },
    orderBy: { name: 'asc' },
  });
  if (squads.length === 0) return [];

  const squadIds = squads.map((squad) => squad.id);

  // Two batched queries rather than per-squad lookups inside the map.
  const [myPlayers, myPending, counts, fulltimeCounts] = await Promise.all([
    prisma.player.findMany({ where: { squadId: { in: squadIds }, email } }),
    prisma.squadJoinRequest.findMany({
      where: { squadId: { in: squadIds }, email, status: JoinRequestStatus.PENDING },
    }),
    prisma.player.groupBy({ by: ['squadId'], where: { squadId: { in: squadIds } }, _count: true }),
    prisma.player.groupBy({
      by: ['squadId'],
      where: { squadId: { in: squadIds }, playerType: PlayerType.FULLTIME },
      _count: true,
    }),
  ]);

  const playerBySquad = new Map(myPlayers.map((player) => [player.squadId, player]));
  const pendingSquadIds = new Set(myPending.map((request) => request.squadId));
  const countBySquad = new Map(counts.map((row) => [row.squadId, row._count]));
  const fulltimeBySquad = new Map(fulltimeCounts.map((row) => [row.squadId, row._count]));

  return squads.map((squad) => {
    const player = playerBySquad.get(squad.id);
    let membership: DirectoryMembership = 'none';
    if (player) {
      membership = isActive(player) ? 'member' : 'memberInactive';
    } else if (pendingSquadIds.has(squad.id)) {
      membership = 'pending';
    }

    return {
      id: squad.id,
      name: squad.name,
      slug: squad.slug,
      playerCount: countBySquad.get(squad.id) ?? 0,
      fulltimePlayerCount: fulltimeBySquad.get(squad.id) ?? 0,
      maxPlayers: squad.maxPlayers,
      scheduleSummary: formatScheduleSummary(squad.schedule),
      membership,
    };
  });
}
