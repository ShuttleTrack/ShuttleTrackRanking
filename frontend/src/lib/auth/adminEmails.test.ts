import { describe, it, expect } from 'vitest';
import { parseAdminEmails } from './adminEmails';

describe('parseAdminEmails (ported AuthEmailProvider.init)', () => {
  it('splits on comma, trims, and lowercases', () => {
    const result = parseAdminEmails(' Admin1@Test.com, admin2@test.com ,Admin3@Test.com');
    expect(result).toEqual(new Set(['admin1@test.com', 'admin2@test.com', 'admin3@test.com']));
  });

  it('undefined/empty input -> empty set (matches the Java "no admin emails" warning path)', () => {
    expect(parseAdminEmails(undefined)).toEqual(new Set());
    expect(parseAdminEmails('')).toEqual(new Set());
  });

  it('ignores stray empty entries from trailing/double commas', () => {
    expect(parseAdminEmails('a@b.com,,c@d.com,')).toEqual(new Set(['a@b.com', 'c@d.com']));
  });
});
