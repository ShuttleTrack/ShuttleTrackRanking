// Multi-squad tenancy (SQUAD_TENANCY_PLAN.md): the old ADMIN/USER access-level split was a
// single global flag derived purely from ALLOWED_ADMIN_EMAILS. That env var is now the
// platform-superadmin list instead - superadmin-ness is still decided the same way (email
// membership in a static set), but per-squad admin/player status is no longer decidable from
// this alone; see lib/auth/squadAccess.ts for the per-request, per-squad resolution.

export function isSuperAdmin(email: string, superAdminEmails: Set<string>): boolean {
  return superAdminEmails.has(email.toLowerCase());
}
