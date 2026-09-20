import { describe, it, expect } from 'vitest';
import { isSuperAdmin } from './accessDecision';

describe('isSuperAdmin', () => {
  const superAdminEmails = new Set(['admin@test.com']);

  it('platform-superadmin email -> true', () => {
    expect(isSuperAdmin('admin@test.com', superAdminEmails)).toBe(true);
  });

  it('different case still matches (comparison is lowercased)', () => {
    expect(isSuperAdmin('Admin@Test.com', superAdminEmails)).toBe(true);
  });

  it('non-superadmin email -> false', () => {
    expect(isSuperAdmin('someone@test.com', superAdminEmails)).toBe(false);
  });
});
