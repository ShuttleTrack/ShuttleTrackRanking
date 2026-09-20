import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
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
