import { describe, it, expect } from 'vitest';
import {
  buildCancellationMessage,
  buildOpenSlotPingMessage,
  buildReminderMessage,
  buildVacancyMessage,
  buildVoteOpenMessage,
  gameDayUrl,
  type MessageContext,
} from './notifications';

const ctx: MessageContext = {
  appUrl: 'https://brs.example.com/',
  squadName: 'Wed <Smashers> & Co',
  slug: 'wed',
  gameDate: '2026-09-23',
  startTime: '19:00',
  endTime: '22:00',
};
const URL = 'https://brs.example.com/s/wed/game-day/2026-09-23';

describe('gameDayUrl', () => {
  it('is the absolute, readable-date URL (Decision 1)', () => {
    expect(gameDayUrl(ctx.appUrl, ctx.slug, ctx.gameDate)).toBe(URL);
  });
});

describe('the four message bodies', () => {
  it('vote is open: session, deadline, link in the text and as a button; names HTML-escaped', () => {
    const post = buildVoteOpenMessage(ctx);
    expect(post.text).toContain('<b>Wed &lt;Smashers&gt; &amp; Co</b>');
    expect(post.text).toContain('Wednesday 23 Sep, 19:00–22:00');
    expect(post.text).toContain('Vote by <b>13:00</b>');
    expect(post.text).toContain(URL);
    expect(post.buttons).toEqual({ inline_keyboard: [[{ text: 'Vote in / out', url: URL }]] });
  });

  it('reminder carries the current count against the minimum, or alone without one', () => {
    expect(buildReminderMessage(ctx, { confirmedIn: 11, minPlayers: 16 }).text).toContain('11 of 16 in so far.');
    expect(buildReminderMessage(ctx, { confirmedIn: 11, minPlayers: null }).text).toContain('11 in so far.');
  });

  it('players needed: the shortfall and the waiting-list rule', () => {
    const text = buildOpenSlotPingMessage(ctx, { confirmedIn: 12, minPlayers: 16 }).text;
    expect(text).toContain('12 of 16 confirmed so far (4 short)');
    expect(text).toContain('join order');
  });

  it('vacancy sync: all four cases, and silence when the group was never asked', () => {
    const v = (promotedNames: string[], remaining: number, extra: Partial<{ previouslyAnnounced: number | null; pingSent: boolean }> = {}) =>
      buildVacancyMessage(ctx, { promotedNames, remaining, previouslyAnnounced: null, pingSent: false, ...extra })?.text ?? null;

    expect(v(['Ada', 'Grace'], 2)).toMatch(/Ada, Grace are in .*\n2 spots still open/);
    expect(v(['Ada'], 0)).toMatch(/Ada is in .*\nThe session is full\./);
    expect(v([], 3)).toContain('3 open slots for Wednesday 23 Sep');
    expect(v([], 1)).toContain('1 open slot for');
    expect(v([], 0, { pingSent: true })).toContain('filled up — no open slots needed');
    expect(v([], 0, { previouslyAnnounced: 2 })).toContain('filled up');
    expect(v([], 0)).toBeNull();
  });

  it('escapes a promoted name that would otherwise break HTML parse mode', () => {
    expect(v2(['<script>'])).toContain('&lt;script&gt;');
    function v2(names: string[]) {
      return buildVacancyMessage(ctx, { promotedNames: names, remaining: 0, previouslyAnnounced: null, pingSent: false })!.text;
    }
  });

  it('cancellation names the session and the reason', () => {
    expect(buildCancellationMessage(ctx, 'Hall closed.').text).toBe('❌ Wednesday 23 Sep, 19:00–22:00 is cancelled.\nHall closed.');
  });

  it('drops the inline button for a URL Telegram would reject (local dev), keeping the link in the text', () => {
    const post = buildVoteOpenMessage({ ...ctx, appUrl: 'http://localhost:3000' });
    expect(post.buttons).toBeUndefined();
    expect(post.text).toContain('http://localhost:3000/s/wed/game-day/2026-09-23');
  });
});
