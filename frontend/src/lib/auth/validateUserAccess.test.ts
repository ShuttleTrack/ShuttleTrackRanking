import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateUserAccessLocal } from './validateUserAccess';

const verifyGoogleIdTokenMock = vi.fn();
const isKnownToAnySquadMock = vi.fn();

// vi.mock calls are hoisted above imports by Vitest, so the static import above safely picks
// up these mocked modules.
vi.mock('./googleIdTokenVerifier', () => ({
  verifyGoogleIdToken: (...args: unknown[]) => verifyGoogleIdTokenMock(...args),
}));

vi.mock('./squadAccess', () => ({
  isKnownToAnySquad: (...args: unknown[]) => isKnownToAnySquadMock(...args),
}));

const SUPER_ADMIN_EMAILS = new Set(['admin@test.com']);

describe('validateUserAccessLocal (multi-squad: coarse "known to the system" gate only)', () => {
  beforeEach(() => {
    verifyGoogleIdTokenMock.mockReset();
    isKnownToAnySquadMock.mockReset();
  });

  it('unverified email -> null', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'someone@test.com', emailVerified: false });
    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);
    expect(result).toBeNull();
    expect(isKnownToAnySquadMock).not.toHaveBeenCalled();
  });

  it('invalid/unparseable token -> null', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue(null);
    const result = await validateUserAccessLocal('bad-token', SUPER_ADMIN_EMAILS);
    expect(result).toBeNull();
  });

  it('platform-superadmin email -> allowed and isSuperAdmin true, without needing any squad membership', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'admin@test.com', emailVerified: true });
    isKnownToAnySquadMock.mockResolvedValue(false);

    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);

    expect(result).toEqual({ email: 'admin@test.com', isSuperAdmin: true, isAllowed: true });
    expect(isKnownToAnySquadMock).not.toHaveBeenCalled();
  });

  it('non-superadmin email known to at least one squad -> allowed, isSuperAdmin false', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'player@test.com', emailVerified: true });
    isKnownToAnySquadMock.mockResolvedValue(true);

    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);

    expect(result).toEqual({ email: 'player@test.com', isSuperAdmin: false, isAllowed: true });
  });

  it('non-superadmin email unknown to every squad -> null', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'stranger@test.com', emailVerified: true });
    isKnownToAnySquadMock.mockResolvedValue(false);

    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);
    expect(result).toBeNull();
  });

  it('email is looked up lowercased', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'Player@Test.com', emailVerified: true });
    isKnownToAnySquadMock.mockResolvedValue(true);

    const result = await validateUserAccessLocal('token', SUPER_ADMIN_EMAILS);

    expect(isKnownToAnySquadMock).toHaveBeenCalledWith('player@test.com');
    expect(result?.email).toBe('player@test.com');
  });
});
