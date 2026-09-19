import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateUserAccessLocal } from './validateUserAccess';

const verifyGoogleIdTokenMock = vi.fn();
const findFirstMock = vi.fn();

// vi.mock calls are hoisted above imports by Vitest, so the static import above safely picks
// up these mocked modules.
vi.mock('./googleIdTokenVerifier', () => ({
  verifyGoogleIdToken: (...args: unknown[]) => verifyGoogleIdTokenMock(...args),
}));

vi.mock('@/lib/prisma', () => ({
  default: { player: { findFirst: (...args: unknown[]) => findFirstMock(...args) } },
}));

const ADMIN_EMAILS = new Set(['admin@test.com']);

describe('validateUserAccessLocal (ported GET /v2/auth: GoogleSSOAuthExtractor + PlayerService.getPlayerAuth)', () => {
  beforeEach(() => {
    verifyGoogleIdTokenMock.mockReset();
    findFirstMock.mockReset();
  });

  it('unverified email -> null', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'someone@test.com', emailVerified: false });
    const result = await validateUserAccessLocal('token', ADMIN_EMAILS);
    expect(result).toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('invalid/unparseable token -> null', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue(null);
    const result = await validateUserAccessLocal('bad-token', ADMIN_EMAILS);
    expect(result).toBeNull();
  });

  it('admin email with a matching Player row -> ADMIN+USER, isAdmin true', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'admin@test.com', emailVerified: true });
    findFirstMock.mockResolvedValue({ id: 42, email: 'admin@test.com' });

    const result = await validateUserAccessLocal('token', ADMIN_EMAILS);

    expect(result).toEqual({
      accessLevel: ['ADMIN', 'USER'],
      isAdmin: true,
      isAllowed: true,
      email: 'admin@test.com',
      playerId: 42,
    });
    expect(findFirstMock).toHaveBeenCalledWith({ where: { email: 'admin@test.com' } });
  });

  it('non-admin verified email with a matching Player row -> USER only, isAdmin false', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'player@test.com', emailVerified: true });
    findFirstMock.mockResolvedValue({ id: 7, email: 'player@test.com' });

    const result = await validateUserAccessLocal('token', ADMIN_EMAILS);

    expect(result).toEqual({
      accessLevel: ['USER'],
      isAdmin: false,
      isAllowed: true,
      email: 'player@test.com',
      playerId: 7,
    });
  });

  it('admin email with NO matching Player row -> null (being an admin email is not enough)', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'admin@test.com', emailVerified: true });
    findFirstMock.mockResolvedValue(null);

    const result = await validateUserAccessLocal('token', ADMIN_EMAILS);
    expect(result).toBeNull();
  });

  it('non-admin verified email with NO matching Player row -> null', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'stranger@test.com', emailVerified: true });
    findFirstMock.mockResolvedValue(null);

    const result = await validateUserAccessLocal('token', ADMIN_EMAILS);
    expect(result).toBeNull();
  });

  it('email is looked up lowercased, and the response uses the stored Player.email '
    + '(not necessarily the exact-case verified token email)', async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({ email: 'Player@Test.com', emailVerified: true });
    findFirstMock.mockResolvedValue({ id: 1, email: 'player@test.com' });

    const result = await validateUserAccessLocal('token', ADMIN_EMAILS);

    expect(findFirstMock).toHaveBeenCalledWith({ where: { email: 'player@test.com' } });
    expect(result?.email).toBe('player@test.com');
  });
});
