import { verifyGoogleIdToken } from './googleIdTokenVerifier';
import { getAdminEmails, parseAdminEmails } from './adminEmails';
import { isSuperAdmin as decideSuperAdmin } from './accessDecision';
import { isKnownToAnySquad } from './squadAccess';

// Ported from backend PlayerController.authPlayer -> PlayerService.getPlayerAuth (GET /v2/auth),
// combined with GoogleSSOAuthExtractor's auth extraction (MIGRATION_PLAN.md Phase 5), then
// reworked for multi-squad tenancy (SQUAD_TENANCY_PLAN.md): access is no longer a single global
// ADMIN/USER flag tied to one Player row. What's still decided here is only the coarse gate -
// "is this a known, verified identity at all" - not squad-specific admin/player status, which is
// resolved per request via lib/auth/squadAccess.ts's getSquadAccess.

export interface AuthResponse {
  email: string;
  isSuperAdmin: boolean;
  isAllowed: boolean;
}

export async function validateUserAccessLocal(
  idToken: string,
  superAdminEmails: Set<string> = getAdminEmails()
): Promise<AuthResponse | null> {
  const verified = await verifyGoogleIdToken(idToken);
  if (!verified || !verified.emailVerified) {
    return null; // GoogleSSOAuthExtractor: invalid/unverified token -> Optional.empty()
  }

  const email = verified.email.toLowerCase();
  const superAdmin = decideSuperAdmin(email, superAdminEmails);

  // Being a platform superadmin is enough on its own; otherwise the email must be a SquadAdmin
  // or Player in at least one squad - being unknown to every squad is denied outright, same as
  // the old single-Player-row lookup's AccessDeniedException.
  const isAllowed = superAdmin || (await isKnownToAnySquad(email));
  if (!isAllowed) {
    return null;
  }

  return { email, isSuperAdmin: superAdmin, isAllowed: true };
}

export { parseAdminEmails };
