import prisma from '@/lib/prisma';
import { verifyGoogleIdToken } from './googleIdTokenVerifier';
import { getAdminEmails, parseAdminEmails } from './adminEmails';
import { decideAccessLevels, AccessLevel } from './accessDecision';

// Ported from backend PlayerController.authPlayer -> PlayerService.getPlayerAuth (GET /v2/auth),
// combined with GoogleSSOAuthExtractor's auth extraction (MIGRATION_PLAN.md Phase 5). This is
// the full local replacement for `authService.ts`'s validateUserAccess, called from both
// [...nextauth].ts's signIn callback and its session callback (on every session load) - same as
// the real GET /v2/auth was.

export interface AuthResponse {
  accessLevel: AccessLevel[];
  isAdmin: boolean;
  isAllowed: boolean;
  email: string;
  playerId?: number;
}

export async function validateUserAccessLocal(idToken: string, adminEmails: Set<string> = getAdminEmails()): Promise<AuthResponse | null> {
  const verified = await verifyGoogleIdToken(idToken);
  if (!verified || !verified.emailVerified) {
    return null; // GoogleSSOAuthExtractor: invalid/unverified token -> Optional.empty()
  }

  const email = verified.email.toLowerCase();
  const accessLevel = decideAccessLevels(email, adminEmails);

  // PlayerService.getPlayerAuth: requires a matching Player row for *either* access level -
  // being an admin email alone isn't sufficient, and there's no case-sensitivity concern here
  // since the real DB column collation (utf8mb4_0900_ai_ci) is itself case-insensitive, same as
  // this plain equality lookup. Uses findFirst rather than a uniqueness-assuming lookup since
  // `email` has no real DB uniqueness constraint (confirmed in Phase 1) - Java's
  // Optional<Player> findByEmail would throw on a genuine duplicate; this silently picks one
  // instead, a minor deviation for a case that shouldn't occur with real data.
  const player = await prisma.player.findFirst({ where: { email } });
  if (!player) {
    return null; // AccessDeniedException -> null (caller treats this as "not allowed")
  }

  return {
    accessLevel,
    isAdmin: accessLevel.includes('ADMIN'),
    isAllowed: true, // always true once a matching player is found, per the branches above
    // Java's PlayerAuth.player.email is the *stored* Player.email, not the verified token's
    // email string - they should always match, but the DB lookup is case/accent-insensitive
    // (utf8mb4_0900_ai_ci), so the stored value could differ in case from `email` in a narrow
    // edge case. Preserved for fidelity, falling back to the verified email if somehow null.
    email: player.email ?? email,
    playerId: player.id,
  };
}

export { parseAdminEmails };
