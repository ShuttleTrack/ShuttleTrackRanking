import { describe, it, expect } from 'vitest';
import { gameDayOpsToWire, parseGameDayOps, validateGameDayOpsInput } from './gameDayOps';

const valid = {
  enabled: true,
  voteOpensDaysBefore: 2,
  minPlayersForOpenSlot: 16,
  telegramMainChatId: '-1001234567890',
  telegramOpenSlotChatId: '@wed_open_slots',
};

describe('validateGameDayOpsInput', () => {
  it('enabled: false clears every other field, whatever else is sent', () => {
    expect(validateGameDayOpsInput({ ...valid, enabled: false })).toEqual({
      data: {
        enabled: false,
        voteOpensDaysBefore: 2,
        minPlayersForOpenSlot: null,
        telegramMainChatId: null,
        telegramOpenSlotChatId: null,
      },
    });
  });

  it('accepts a full valid config, trimming chat ids', () => {
    const result = validateGameDayOpsInput({ ...valid, telegramMainChatId: '  -1001234567890 ' });
    expect(result).toEqual({ data: { ...valid } });
  });

  it('defaults voteOpensDaysBefore to 2 and treats blank chat ids as none', () => {
    const result = validateGameDayOpsInput({ enabled: true, telegramMainChatId: '' });
    expect(result).toEqual({
      data: { enabled: true, voteOpensDaysBefore: 2, minPlayersForOpenSlot: null, telegramMainChatId: null, telegramOpenSlotChatId: null },
    });
  });

  it('rejects an out-of-range voteOpensDaysBefore', () => {
    for (const v of [0, 15, 2.5, '2']) {
      expect(validateGameDayOpsInput({ ...valid, voteOpensDaysBefore: v })).toHaveProperty('error');
    }
  });

  it('rejects an out-of-range minimum', () => {
    for (const v of [3, 21, 16.5, '16']) {
      expect(validateGameDayOpsInput({ ...valid, minPlayersForOpenSlot: v })).toHaveProperty('error');
    }
  });

  it('rejects a malformed chat id', () => {
    expect(validateGameDayOpsInput({ ...valid, telegramMainChatId: 'https://t.me/x' })).toHaveProperty('error');
    expect(validateGameDayOpsInput({ ...valid, telegramOpenSlotChatId: 12345 })).toHaveProperty('error');
  });

  it('rejects an open-slot chat id without the open-slot flow it belongs to, with a clear message', () => {
    const result = validateGameDayOpsInput({ ...valid, minPlayersForOpenSlot: null });
    expect(result).toEqual({
      error: 'An open-slot group chat id needs a minimum player count - without one there is no open-slot flow to announce',
    });
  });
});

describe('parseGameDayOps', () => {
  it('reads a disabled, missing or malformed blob as "not configured" rather than throwing', () => {
    expect(parseGameDayOps(null)).toBeNull();
    expect(parseGameDayOps('nonsense')).toBeNull();
    expect(parseGameDayOps({ ...valid, enabled: false })).toBeNull();
    expect(parseGameDayOps({ ...valid, voteOpensDaysBefore: 999 })).toBeNull();
    expect(parseGameDayOps(valid)).toEqual(valid);
  });

  it('unpacks into flat wire names for GET /api/squads/[squadId]', () => {
    expect(gameDayOpsToWire(valid)).toEqual({
      gameDayOpsEnabled: true,
      gameDayVoteOpensDaysBefore: 2,
      gameDayMinPlayersForOpenSlot: 16,
      gameDayTelegramMainChatId: '-1001234567890',
      gameDayTelegramOpenSlotChatId: '@wed_open_slots',
    });
    expect(gameDayOpsToWire(null).gameDayOpsEnabled).toBe(false);
  });
});
