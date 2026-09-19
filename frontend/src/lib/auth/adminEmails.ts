// Ported from backend common/AuthEmailProvider.java (MIGRATION_PLAN.md Phase 5). Comma-separated
// list, trimmed and lowercased per entry - same env var (ALLOWED_ADMIN_EMAILS) already
// provisioned as a frontend secret per §2 of the plan, previously unused in code.

export function parseAdminEmails(raw: string | undefined): Set<string> {
  const emails = new Set<string>();
  if (!raw) return emails;
  for (const email of raw.split(',')) {
    const trimmed = email.trim().toLowerCase();
    if (trimmed) emails.add(trimmed);
  }
  return emails;
}

export function getAdminEmails(): Set<string> {
  return parseAdminEmails(process.env.ALLOWED_ADMIN_EMAILS);
}
