import { describe, it, expect } from 'vitest';
import {
  isActive,
  isDisabled,
  isAvailableForGame,
  derivePlayerStatus,
  filterPlayersByStatusParam,
} from './playerStatus';

describe('playerStatus (ported from backend Player.java / PlayerService.java)', () => {
  describe('isActive / isDisabled / isAvailableForGame', () => {
    it('ACTIVE is active and available, not disabled', () => {
      const p = { playerStatus: 'ACTIVE' };
      expect(isActive(p)).toBe(true);
      expect(isDisabled(p)).toBe(false);
      expect(isAvailableForGame(p)).toBe(true);
    });

    it('DISABLED is disabled and not available', () => {
      const p = { playerStatus: 'DISABLED' };
      expect(isActive(p)).toBe(false);
      expect(isDisabled(p)).toBe(true);
      expect(isAvailableForGame(p)).toBe(false);
    });

    it('ENABLED is available but neither active nor disabled', () => {
      const p = { playerStatus: 'ENABLED' };
      expect(isActive(p)).toBe(false);
      expect(isDisabled(p)).toBe(false);
      expect(isAvailableForGame(p)).toBe(true);
    });

    it('null status behaves like ENABLED (available, not active, not disabled) - matches Java isAvailableForGame() = status != DISABLED', () => {
      const p = { playerStatus: null };
      expect(isActive(p)).toBe(false);
      expect(isDisabled(p)).toBe(false);
      expect(isAvailableForGame(p)).toBe(true);
    });
  });

  describe('derivePlayerStatus', () => {
    it.each([
      ['ACTIVE', 'ACTIVE'],
      ['ENABLED', 'ENABLED'],
      ['DISABLED', 'DISABLED'],
      [null, 'ENABLED'],
    ] as const)('playerStatus=%s -> %s', (raw, expected) => {
      expect(derivePlayerStatus({ playerStatus: raw })).toBe(expected);
    });
  });

  describe('filterPlayersByStatusParam', () => {
    const players = [
      { id: 1, playerStatus: 'ACTIVE' },
      { id: 2, playerStatus: 'ENABLED' },
      { id: 3, playerStatus: 'DISABLED' },
      { id: 4, playerStatus: null },
    ];

    it('undefined/empty/"ALL"/unrecognized -> everyone', () => {
      for (const status of [undefined, '', 'all', 'ALL', 'bogus']) {
        expect(filterPlayersByStatusParam(players, status).map((p) => p.id)).toEqual([1, 2, 3, 4]);
      }
    });

    it('"INACTIVE" -> only disabled', () => {
      expect(filterPlayersByStatusParam(players, 'inactive').map((p) => p.id)).toEqual([3]);
    });

    it('"ACTIVE" -> only active', () => {
      expect(filterPlayersByStatusParam(players, 'ACTIVE').map((p) => p.id)).toEqual([1]);
    });

    it('"ENABLED" -> everyone not disabled (includes null status)', () => {
      expect(filterPlayersByStatusParam(players, 'ENABLED').map((p) => p.id)).toEqual([1, 2, 4]);
    });
  });
});
