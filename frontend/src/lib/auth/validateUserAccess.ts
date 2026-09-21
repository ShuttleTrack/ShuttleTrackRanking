import { verifyGoogleIdToken } from './googleIdTokenVerifier';
import { getAdminEmails, parseAdminEmails } from './adminEmails';
import { isSuperAdmin as decideSuperAdmin } from './accessDecision';

// Ported from backend PlayerController.authPlayer -> PlayerService.getPlayerAuth (GET /v2/auth),
// combined with GoogleSSOAuthExtractor's auth extraction (MIGRATION_PLAN.md Phase 5), then
// reworked for multi-squad tenancy (SQUAD_TENANCY_PLAN.md): access is no longer a single global
// ADMIN/USER flag tied to one Player row. What's decided here is only "is this a verified
// identity at all" - not squad-specific admin/player status, which is resolved per request via
// lib/auth/squadAccess.ts's getSquadAccess.
//
// Self-registration (SELF_REGISTRATION_PLAN.md) removed the membership half of this gate: a
// verified Google identity is now enough to hold a session, whether or not it's known to any
// squad. It had to go - the whole point is "sign in first, then ask to join a squad", and the
// old check made that impossible (an unknown email got a bare sign-in failure with no
// explanation). It was never the real access boundary either: middleware.ts only enforces
// "signed in at all", and every page/API gate below it re-resolves membership per request
// (resolveSquadAdminOrRedirect / resolveSquadUserOrRedirect / requireSquadAdmin /
// requireSuperAdmin / an explicit getSquadAccess call). A zero-squad session therefore sees
// exactly what a signed-out visitor sees, plus the join-request surface.
//
// The corollary, and the thing to keep in mind when adding any new write route: a session no
// longer implies membership anywhere, so no route may take the actor's identity from a request
// body. See lib/joinRequests.ts's actorEmail arguments.

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

  // A verified identity is allowed, full stop. isAllowed is kept on the response (rather than
  // dropped now that it's always true here) because NextAuth's signIn callback reads it, and a
  // null return above is still the "not a verified identity" answer.
  return { email, isSuperAdmin: superAdmin, isAllowed: true };
}

export { parseAdminEmails };
