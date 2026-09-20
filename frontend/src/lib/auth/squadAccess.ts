import type { Player, Squad } from '@prisma/client';
import prisma from '@/lib/prisma';

// Multi-squad tenancy (SQUAD_TENANCY_PLAN.md): access is resolved per request, per squad -
// never cached on the session - so the same signed-in email can be an admin in one squad and a
// plain player (or nobody) in another with no stale cross-squad state.

export interface SquadAccess {
  isSquadAdmin: boolean;
  player: Player | null;
}

// Looks up this email's standing in exactly one squad. A platform superadmin is implicitly an
// admin of every squad - callers pass that in rather than re-deriving it here, since it comes
// from the static ALLOWED_ADMIN_EMAILS list, not a DB lookup.
export async function getSquadAccess(email: string, squadId: number): Promise<SquadAccess> {
  const lowerEmail = email.toLowerCase();
  const [admin, player] = await Promise.all([
    prisma.squadAdmin.findUnique({ where: { squadId_email: { squadId, email: lowerEmail } } }),
    prisma.player.findUnique({ where: { squadId_email: { squadId, email: lowerEmail } } }),
  ]);
  return { isSquadAdmin: admin !== null, player };
}

// Whether this email is known to the system at all, across any squad - the coarse gate used by
// NextAuth's signIn callback. Being a platform superadmin, a SquadAdmin of any squad, or a
// Player in any squad all count.
export async function isKnownToAnySquad(email: string): Promise<boolean> {
  const lowerEmail = email.toLowerCase();
  const [admin, player] = await Promise.all([
    prisma.squadAdmin.findFirst({ where: { email: lowerEmail } }),
    prisma.player.findFirst({ where: { email: lowerEmail } }),
  ]);
  return admin !== null || player !== null;
}

export async function getSquadBySlug(slug: string): Promise<Squad | null> {
  return prisma.squad.findUnique({ where: { slug } });
}

// Squads this email administers or plays in (any status), for the squad-picker landing page.
export async function getSquadsForEmail(email: string): Promise<Squad[]> {
  const lowerEmail = email.toLowerCase();
  const [asAdmin, asPlayer] = await Promise.all([
    prisma.squad.findMany({ where: { admins: { some: { email: lowerEmail } } } }),
    prisma.squad.findMany({ where: { players: { some: { email: lowerEmail } } } }),
  ]);
  const byId = new Map<number, Squad>();
  for (const squad of [...asAdmin, ...asPlayer]) byId.set(squad.id, squad);
  return Array.from(byId.values());
}
