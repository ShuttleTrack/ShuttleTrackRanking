import { describe, expect, it } from 'vitest';
import { getLoginErrorMessage, safeCallbackUrl } from './loginAuth';

describe('safeCallbackUrl', () => {
  // The default is /squads, not / - a zero-squad session is a real state now and needs to land
  // somewhere that offers the squad directory (SELF_REGISTRATION_PLAN.md).
  it('defaults when missing or invalid', () => {
    expect(safeCallbackUrl(undefined)).toBe('/squads');
    expect(safeCallbackUrl(['/s/wed', '/evil'])).toBe('/s/wed');
    expect(safeCallbackUrl('//evil.com')).toBe('/squads');
    expect(safeCallbackUrl('https://evil.com')).toBe('/squads');
  });

  it('still honours an explicit destination over the default', () => {
    expect(safeCallbackUrl('/')).toBe('/');
    expect(safeCallbackUrl('/squads/browse')).toBe('/squads/browse');
  });

  it('allows relative paths', () => {
    expect(safeCallbackUrl('/squads')).toBe('/squads');
    expect(safeCallbackUrl('/s/foo/admin/dashboard')).toBe('/s/foo/admin/dashboard');
  });
});

describe('getLoginErrorMessage', () => {
  it('returns null when no error', () => {
    expect(getLoginErrorMessage(undefined)).toBeNull();
  });

  // Not "ask a squad admin to add you" any more: self-registration means not being on a roster
  // no longer blocks sign-in, so that advice would push people away from the join-request flow.
  it('maps AccessDenied to a verification problem, not a roster one', () => {
    const message = getLoginErrorMessage('AccessDenied');
    expect(message).toMatch(/verify/i);
    expect(message).not.toMatch(/roster|squad admin/i);
  });

  it('maps other errors generically', () => {
    expect(getLoginErrorMessage('OAuthCallback')).toMatch(/try again/i);
  });
});
