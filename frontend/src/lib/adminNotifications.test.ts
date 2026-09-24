import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    squad: { findUnique: vi.fn() },
    player: { findMany: vi.fn() },
  },
}));

import prisma from '@/lib/prisma';
import type { SlotReplacement, SquadJoinRequest } from '@prisma/client';
import {
  adminPlayersUrl,
  buildCancellationRequestMessage,
  buildJoinRequestMessage,
  buildReplacementCreatedMessage,
  notifyAdminsOfCancellationRequest,
  notifyAdminsOfJoinRequest,
  notifyAdminsOfReplacement,
} from './adminNotifications';

type Mock = ReturnType<typeof vi.fn>;
const mocked = prisma as unknown as { squad: { findUnique: Mock }; player: { findMany: Mock } };

const ctx = { appUrl: 'https://brs.example.com/', squadName: 'Wed <Smashers>', slug: 'wednesday' };
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('message builders', () => {
  it('links to the admin players page, with a button on a real host', () => {
    expect(adminPlayersUrl(ctx)).toBe('https://brs.example.com/s/wednesday/admin/players');
    const post = buildJoinRequestMessage(ctx, { name: 'Sam', email: 'sam@example.com', message: null });
    expect(post.text).toContain('https://brs.example.com/s/wednesday/admin/players');
    expect(post.buttons?.inline_keyboard[0][0].url).toBe('https://brs.example.com/s/wednesday/admin/players');
  });

  it('escapes user-supplied text in a join request', () => {
    const post = buildJoinRequestMessage(ctx, { name: 'A<b>', email: 'a@example.com', message: 'hi & bye' });
    expect(post.text).toContain('Wed &lt;Smashers&gt;');
    expect(post.text).toContain('A&lt;b&gt; (a@example.com) asked to join');
    expect(post.text).toContain('hi &amp; bye');
  });

  it('describes a new long-term replacement with its window', () => {
    const post = buildReplacementCreatedMessage(ctx, {
      ownerName: 'Owner',
      replacementName: 'Filler',
      startDate: date('2026-10-07'),
      endDate: date('2026-10-21'),
    });
    expect(post.text).toContain("Filler covers Owner's slot from Wed 7 Oct 2026 to Wed 21 Oct 2026.");
  });

  it('distinguishes a cancellation request from a shorten request', () => {
    const base = { ownerName: 'Owner', replacementName: 'Filler', startDate: date('2026-10-07'), endDate: date('2026-10-21') };
    const cancel = buildCancellationRequestMessage(ctx, { ...base, requestedEndDate: null });
    expect(cancel.text).toContain('Replacement cancellation request');
    expect(cancel.text).toContain("Owner asks to cancel Filler's replacement (Wed 7 Oct 2026 to Wed 21 Oct 2026).");

    const shorten = buildCancellationRequestMessage(ctx, { ...base, requestedEndDate: date('2026-10-14') });
    expect(shorten.text).toContain('Replacement shorten request');
    expect(shorten.text).toContain('to end on Wed 14 Oct 2026.');
  });
});

describe('notifyAdminsOf*', () => {
  const fetchMock = vi.fn();
  const joinRequest = { id: 3, squadId: 1, name: 'Sam', email: 'sam@example.com', message: null } as SquadJoinRequest;
  const replacement = {
    id: 9,
    squadId: 1,
    fulltimePlayerId: 5,
    replacementPlayerId: 6,
    startDate: date('2026-10-07'),
    endDate: date('2026-10-21'),
    cancellationRequestedAt: null,
    cancellationRequestedEndDate: null,
  } as SlotReplacement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://brs.example.com');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    mocked.squad.findUnique.mockResolvedValue({ name: 'Wed', slug: 'wednesday', adminTelegramChatId: '-100123' });
    mocked.player.findMany.mockResolvedValue([
      { id: 5, name: 'Owner' },
      { id: 6, name: 'Filler' },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

  it('sends a join request to the admin group with the shared bot token', async () => {
    await notifyAdminsOfJoinRequest(joinRequest);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/bottoken/sendMessage');
    expect(sentBody().chat_id).toBe('-100123');
    expect(sentBody().text).toContain('Sam (sam@example.com) asked to join');
  });

  it('sends nothing when the squad has no admin group', async () => {
    mocked.squad.findUnique.mockResolvedValue({ name: 'Wed', slug: 'wednesday', adminTelegramChatId: null });
    await notifyAdminsOfJoinRequest(joinRequest);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never rejects, even when Telegram is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(notifyAdminsOfReplacement(replacement)).resolves.toBeUndefined();
  });

  it('names both players in a new replacement', async () => {
    await notifyAdminsOfReplacement(replacement);
    expect(sentBody().text).toContain("Filler covers Owner's slot");
  });

  it('posts a pending cancellation request, but not the already-cancelled no-op return', async () => {
    await notifyAdminsOfCancellationRequest(replacement);
    expect(fetchMock).not.toHaveBeenCalled();

    await notifyAdminsOfCancellationRequest({
      ...replacement,
      cancellationRequestedAt: new Date(),
      cancellationRequestedEndDate: date('2026-10-14'),
    });
    expect(sentBody().text).toContain("Owner asks to shorten Filler's replacement");
  });
});
