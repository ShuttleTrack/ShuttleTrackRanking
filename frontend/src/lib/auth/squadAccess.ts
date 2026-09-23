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

// isKnownToAnySquad used to live here as the coarse gate for NextAuth's signIn callback.
// Removed by self-registration (SELF_REGISTRATION_PLAN.md): a verified Google identity is now
// enough to hold a session whether or not it belongs to any squad, since the whole flow is
// "sign in first, then ask to join". See lib/auth/validateUserAccess.ts for the full reasoning.

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
