import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import type { Player } from "@prisma/client";
import { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getSquadAccess } from "@/lib/auth/squadAccess";

// Multi-squad tenancy (SQUAD_TENANCY_PLAN.md): "admin" is no longer a single global flag on the
// session. requireSquadAdmin checks admin rights scoped to one squad (a platform superadmin is
// implicitly an admin of every squad); requireSuperAdmin gates the platform-level surface
// (creating squads, assigning squad admins).

export const requireSquadAdmin = async (
  req: NextApiRequest,
  res: NextApiResponse,
  squadId: number
): Promise<Session | null> => {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  if (session.user.isSuperAdmin) {
    return session;
  }

  const { isSquadAdmin } = await getSquadAccess(session.user.email, squadId);
  if (!isSquadAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  return session;
};

// Member-level gate (ATTENDANCE_VOTE_PLAN.md): "signed in, and connected to this squad somehow"
// - a Player row OR admin rights (squad admin or platform superadmin). It deliberately does NOT
// guarantee a player: several callers legitimately admit an admin who has none (the replacement
// list returns them an empty "own" list). Routes that act *as a player* must check the returned
// `player` themselves - the admin bypass gets someone past this gate, not into a ballot.
export const requireSquadMember = async (
  req: NextApiRequest,
  res: NextApiResponse,
  squadId: number
): Promise<{ session: Session; email: string; player: Player | null; isAdmin: boolean } | null> => {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  const { player, isSquadAdmin } = await getSquadAccess(session.user.email, squadId);
  const isAdmin = isSquadAdmin || Boolean(session.user.isSuperAdmin);
  if (!player && !isAdmin) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  return { session, email: session.user.email, player, isAdmin };
};

export const requireSuperAdmin = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> => {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.isSuperAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  return session;
};
