// Ported from backend configuration/GoogleSSOAuthExtractor.java's branch for the `/v2/auth`
// route specifically (MIGRATION_PLAN.md Phase 5). The Java extractor is shared across all
// `/v2/*` routes and only grants USER to a verified-but-non-admin email on the literal `/v2/auth`
// URI (rejecting it everywhere else) - this module IS that endpoint's logic, so that branch
// collapses to "verified non-admin always gets USER here".
//
// NOTE: this alone isn't the full access decision - PlayerService.getPlayerAuth() additionally
// requires a matching Player row by email (for *both* ADMIN and USER), or denies outright. That
// DB-dependent half lives in validateUserAccess.ts, not here, so this piece stays pure/testable.

export type AccessLevel = 'ADMIN' | 'USER';

export function decideAccessLevels(email: string, adminEmails: Set<string>): AccessLevel[] {
  return adminEmails.has(email.toLowerCase()) ? ['ADMIN', 'USER'] : ['USER'];
}
