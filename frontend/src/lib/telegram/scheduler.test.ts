import { describe, it, expect } from 'vitest';
import { decidePollForDate } from './scheduler';

describe('decidePollForDate (ported EncounterScheduler.scheduleEncounter)', () => {
  it('Monday with a chat id configured -> sends, targeting the next Wednesday', () => {
    const monday = new Date(Date.UTC(2026, 8, 14));
    const decision = decidePollForDate(monday, 'monday-chat-id');
    expect(decision.send).toBe(true);
    expect(decision.chatId).toBe('monday-chat-id');
    expect(decision.matchDate).toEqual(new Date(Date.UTC(2026, 8, 16)));
  });

  it('Wednesday with a chat id configured -> sends, targeting the next Friday', () => {
    const wednesday = new Date(Date.UTC(2026, 8, 16));
    const decision = decidePollForDate(wednesday, 'wednesday-chat-id');
    expect(decision.send).toBe(true);
    expect(decision.matchDate).toEqual(new Date(Date.UTC(2026, 8, 18)));
  });

  it('a day with no configured schedule (e.g. Tuesday) -> does not send', () => {
    const tuesday = new Date(Date.UTC(2026, 8, 15));
    const decision = decidePollForDate(tuesday, 'some-chat-id');
    expect(decision.send).toBe(false);
    expect(decision.reason).toMatch(/No group configured/);
  });

  it('a scheduled day with no chat id resolved (missing env var) -> does not send', () => {
    const monday = new Date(Date.UTC(2026, 8, 14));
    const decision = decidePollForDate(monday, undefined);
    expect(decision.send).toBe(false);
    expect(decision.reason).toMatch(/No chat id configured/);
  });
});
