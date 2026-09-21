import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateUserAccessLocal } from './validateUserAccess';

const verifyGoogleIdTokenMock = vi.fn();

// vi.mock calls are hoisted above imports by Vitest, so the static import above safely picks
// up these mocked modules.
vi.mock('./googleIdTokenVerifier', () => ({
  verifyGoogleIdToken: (...args: unknown[]) => verifyGoogleIdTokenMock(...args),
}));

const SUPER_ADMIN_EMAILS = new Set(['admin@test.com']);

// Self-registration (SELF_REGISTRATION_PLAN.md) removed the "known to at least one squad" half
// of this gate - it's now purely "is this a verified Google identity". The cases that used to
// assert an unknown email was denied now assert the opposite: a stranger gets a session, with no
// squad standing attached to it. Squad-level access is resolved per request elsewhere
// (getSquadAccess / requireSquadAdmin / resolveSquad*), which is what this file never decided.
describe('validateUserAccessLocal (verified-identity gate only)', () => {
  beforeEach(() => {
    verifyGoogleIdTokenMock.mockReset();
  });

  it('unverified email -> null', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'someone@test.com', emailVerified: false });
    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);
    expect(result).toBeNull();
  });

  it('invalid/unparseable token -> null', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue(null);
    const result = await validateUserAccessLocal('bad-token', SUPER_ADMIN_EMAILS);
    expect(result).toBeNull();
  });

  it('platform-superadmin email -> allowed and isSuperAdmin true', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'admin@test.com', emailVerified: true });

    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);

    expect(result).toEqual({ email: 'admin@test.com', isSuperAdmin: true, isAllowed: true });
  });

  it('a verified email with no squad membership at all -> allowed, isSuperAdmin false', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'stranger@test.com', emailVerified: true });

    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);

    // The change self-registration depends on: before, this was null and the person could not
    // sign in to ask to join anything.
    expect(result).toEqual({ email: 'stranger@test.com', isSuperAdmin: false, isAllowed: true });
  });

  it('email is normalised to lowercase', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'Player@Test.com', emailVerified: true });

    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);

    expect(result?.email).toBe('player@test.com');
  });

  it('superadmin matching is case-insensitive on the token side', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'Admin@Test.com', emailVerified: true });

    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);

    expect(result).toEqual({ email: 'admin@test.com', isSuperAdmin: true, isAllowed: true });
  });
});
