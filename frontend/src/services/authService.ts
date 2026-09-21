import { validateUserAccessLocal } from '@/lib/auth/validateUserAccess';

// MIGRATION_PLAN.md Phase 5: replaces the round-trip to the Java backend's GET /v2/auth
// (GoogleSSOAuthExtractor + PlayerService.getPlayerAuth) with local logic - same signature and
// return shape as before, so [...nextauth].ts and lib/auth.ts need no changes. See
// lib/auth/validateUserAccess.ts for the ported logic itself.

interface AuthResponse {
  email: string;
  isSuperAdmin: boolean;
  isAllowed: boolean;
}

export const validateUserAccess = async (token: string): Promise<AuthResponse | null> => {
  return validateUserAccessLocal(token);
};
