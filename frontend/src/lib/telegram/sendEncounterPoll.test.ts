import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendEncounterPoll } from './sendEncounterPoll';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendEncounterPoll (ported EncounterScheduler.sendEncounterPoll)', () => {
  it('sends the exact question/options/flags the real backend sends', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEncounterPoll('bot-token', 'chat-123', new Date(Date.UTC(2026, 8, 16)));

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendPoll',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      chat_id: 'chat-123',
      question: 'Joining Badminton on 2026-09-16',
      options: ['In', 'In (from overflow)', 'Out', 'Out (slot passed to someone else)'],
      allows_multiple_answers: false,
      is_anonymous: false,
    });
  });

  it('a Telegram API error response -> ok:false with the description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ ok: false, description: 'chat not found' }),
      })
    );

    const result = await sendEncounterPoll('bot-token', 'bad-chat', new Date());
    expect(result.ok).toBe(false);
    expect(result.description).toBe('chat not found');
  });
});
