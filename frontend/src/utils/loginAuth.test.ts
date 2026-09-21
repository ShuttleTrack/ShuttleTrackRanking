import { describe, expect, it } from 'vitest';
import { getLoginErrorMessage, safeCallbackUrl } from './loginAuth';

describe('safeCallbackUrl', () => {
  it('defaults when missing or invalid', () => {
    expect(safeCallbackUrl(undefined)).toBe('/');
    expect(safeCallbackUrl(['/squads', '/evil'])).toBe('/squads');
    expect(safeCallbackUrl('//evil.com')).toBe('/');
    expect(safeCallbackUrl('https://evil.com')).toBe('/');
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

  it('maps AccessDenied', () => {
    expect(getLoginErrorMessage('AccessDenied')).toMatch(/roster/i);
  });

  it('maps other errors generically', () => {
    expect(getLoginErrorMessage('OAuthCallback')).toMatch(/try again/i);
  });
});
