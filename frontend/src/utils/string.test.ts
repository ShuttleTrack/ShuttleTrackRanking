import { describe, it, expect } from 'vitest';
import { publicDisplayName } from './string';

describe('publicDisplayName', () => {
  it('returns first name and second initial for two-part names', () => {
    expect(publicDisplayName('nishan karunarathna')).toBe('Nishan K');
  });

  it('returns the single name when there is no second part', () => {
    expect(publicDisplayName('manjula')).toBe('Manjula');
  });

  it('drops words after the second', () => {
    expect(publicDisplayName('john paul smith')).toBe('John P');
  });

  it('returns empty for blank input', () => {
    expect(publicDisplayName('')).toBe('');
    expect(publicDisplayName('   ')).toBe('');
  });
});
