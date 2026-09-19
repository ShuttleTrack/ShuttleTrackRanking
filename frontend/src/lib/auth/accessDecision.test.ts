import { describe, it, expect } from 'vitest';
import { decideAccessLevels } from './accessDecision';

describe('decideAccessLevels (ported GoogleSSOAuthExtractor.extract /v2/auth branch)', () => {
  const adminEmails = new Set(['admin@test.com']);

  it('admin email -> [ADMIN, USER]', () => {
    expect(decideAccessLevels('admin@test.com', adminEmails)).toEqual(['ADMIN', 'USER']);
  });

  it('admin email in different case still matches (comparison is lowercased)', () => {
    expect(decideAccessLevels('Admin@Test.com', adminEmails)).toEqual(['ADMIN', 'USER']);
  });

  it('non-admin verified email -> [USER] (this module IS the /v2/auth endpoint, where a '
    + 'verified non-admin is granted access - the Java extractor denies this on every other '
    + '/v2/* route, which is out of scope here)', () => {
    expect(decideAccessLevels('someone@test.com', adminEmails)).toEqual(['USER']);
  });
});
