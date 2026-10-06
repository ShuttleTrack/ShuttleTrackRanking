import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTelegramMessage } from './sendMessage';

describe('sendTelegramMessage', () => {
  const fetchMock = vi.fn();
  const buttons = { inline_keyboard: [[{ text: 'Vote in / out', url: 'https://brs.example.com/s/wed/game-day/2026-10-07' }]] };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('logs the message instead of sending when sending is not enabled', async () => {
    vi.stubEnv('TELEGRAM_SEND_ENABLED', '');
    const result = await sendTelegramMessage('token', '-100123', 'Are you in?', buttons);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, skipped: true });
    const logged = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(logged).toContain('-100123');
    expect(logged).toContain('Are you in?');
    expect(logged).toContain('[Vote in / out] https://brs.example.com/s/wed/game-day/2026-10-07');
  });

  it('logs rather than failing when disabled even without a bot token', async () => {
    vi.stubEnv('TELEGRAM_SEND_ENABLED', 'false');
    const result = await sendTelegramMessage(undefined, '-100123', 'Are you in?');
    expect(result.skipped).toBe(true);
  });

  it('fails without a bot token when enabled', async () => {
    vi.stubEnv('TELEGRAM_SEND_ENABLED', 'true');
    const result = await sendTelegramMessage(undefined, '-100123', 'Are you in?');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, description: 'TELEGRAM_BOT_TOKEN is not set' });
  });

  it('sends with a timeout signal when enabled', async () => {
    vi.stubEnv('TELEGRAM_SEND_ENABLED', 'true');
    const result = await sendTelegramMessage('token', '-100123', 'Are you in?');
    expect(result).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/bottoken/sendMessage');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  const sentText = () => JSON.parse(fetchMock.mock.calls[0][1].body).text;

  it('sends the text unchanged on production', async () => {
    vi.stubEnv('TELEGRAM_SEND_ENABLED', 'true');
    vi.stubEnv('APP_ENV', 'production');
    await sendTelegramMessage('token', '-100123', 'Are you in?');
    expect(sentText()).toBe('Are you in?');
  });

  it('marks the text as a testing message off production', async () => {
    vi.stubEnv('TELEGRAM_SEND_ENABLED', 'true');
    vi.stubEnv('APP_ENV', '');
    await sendTelegramMessage('token', '-100123', 'Are you in?');
    expect(sentText()).toBe('Are you in? - Testing message. Please ignore.');
  });
});
