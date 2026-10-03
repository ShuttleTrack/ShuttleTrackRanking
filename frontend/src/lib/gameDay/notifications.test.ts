import { describe, it, expect } from 'vitest';
import {
  buildCancellationMessage,
  buildNominationMessage,
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
const SQUAD_URL = 'https://brs.example.com/s/wed';

describe('gameDayUrl', () => {
  it('is the absolute, readable-date URL (Decision 1)', () => {
    expect(gameDayUrl(ctx.appUrl, ctx.slug, ctx.gameDate)).toBe(URL);
  });
});

describe('the four message bodies', () => {
  it('vote is open: session question, deadline, link via button only', () => {
    const post = buildVoteOpenMessage(ctx);
    expect(post.text).toBe('Are you in for Wednesday 23 Sep, 19:00–22:00?\nVote by <b>13:00</b> on the game day.');
    expect(post.text).not.toContain('Wed &lt;Smashers&gt;');
    expect(post.text).not.toContain(URL);
    expect(post.buttons).toEqual({ inline_keyboard: [[{ text: 'Vote in / out', url: URL }]] });
  });

  it('reminder: deadline, voted count, and roll-call sections', () => {
    const post = buildReminderMessage(ctx, {
      voted: 13,
      holders: 18,
      in: [
        { name: 'Ada Lovelace', standingInForName: null },
        { name: 'Bob Smith', standingInForName: 'Carol White' },
      ],
      out: [{ name: 'Dan Jones', standingInForName: null }],
      yetToVote: [{ name: 'Eve Black', standingInForName: null }, { name: 'A<b>', standingInForName: null }],
      waiting: [
        { name: 'Grace Hopper', standingInForName: null },
        { name: 'Zed Alpha', standingInForName: null },
      ],
    });
    expect(post.text).toContain("Vote by <b>13:00</b> today, or you're considered out.");
    expect(post.text).toContain('<b>13</b> of 18 have voted and <b>2</b> in open slot waiting list.');
    const yetToVoteIdx = post.text.indexOf('Yet to vote');
    const inIdx = post.text.indexOf('\nIn\n');
    const waitingIdx = post.text.indexOf('\nOpen slot waiting list\n');
    const outIdx = post.text.indexOf('\nOut\n');
    expect(yetToVoteIdx).toBeGreaterThan(-1);
    expect(inIdx).toBeGreaterThan(-1);
    expect(waitingIdx).toBeGreaterThan(-1);
    expect(outIdx).toBeGreaterThan(-1);
    expect(yetToVoteIdx).toBeLessThan(inIdx);
    expect(inIdx).toBeLessThan(waitingIdx);
    expect(waitingIdx).toBeLessThan(outIdx);
    expect(post.text).toContain('⏳ Grace H');
    expect(post.text).toContain('⏳ Zed A');
    expect(post.text).toContain('✅ Ada L');
    expect(post.text).not.toContain('Lovelace');
    expect(post.text).toContain('✅ Bob S for Carol W');
    expect(post.text).not.toContain('Smith');
    expect(post.text).not.toContain('White');
    expect(post.text).toContain('❌ Dan J');
    expect(post.text).not.toContain('Jones');
    expect(post.text).toContain('❓ Eve B');
    expect(post.text).not.toContain('Black');
    expect(post.text).toContain('❓ A&lt;b&gt;');
    expect(post.text).not.toContain(URL);
    expect(post.buttons).toEqual({ inline_keyboard: [[{ text: 'Vote in / out', url: URL }]] });
  });

  it('reminder omits empty Out section', () => {
    const post = buildReminderMessage(ctx, {
      voted: 2,
      holders: 2,
      in: [{ name: 'Ada', standingInForName: null }],
      out: [],
      yetToVote: [],
      waiting: [],
    });
    expect(post.text).toContain('<b>2</b> of 2 have voted and <b>0</b> in open slot waiting list.');
    expect(post.text).not.toContain('\nOpen slot waiting list\n');
    expect(post.text).not.toContain('\nOut\n');
  });

  it('reminder appends the game-day URL when the inline button is unavailable', () => {
    const post = buildReminderMessage(
      { ...ctx, appUrl: 'http://localhost:3000' },
      {
        voted: 0,
        holders: 1,
        in: [],
        out: [],
        yetToVote: [{ name: 'Ada', standingInForName: null }],
        waiting: [],
      }
    );
    expect(post.buttons).toBeUndefined();
    expect(post.text).toContain('http://localhost:3000/s/wed/game-day/2026-09-23');
  });

  it('players needed: the shortfall headline and waiting-list rule, link via button only', () => {
    const post = buildOpenSlotPingMessage(ctx, { confirmedIn: 12, minPlayers: 16 });
    expect(post.text).toContain('We need <b>4</b> more players for Wednesday 23 Sep, 19:00–22:00');
    expect(post.text).toContain('first come, first served');
    expect(post.text).not.toContain(URL);
    expect(post.buttons).toEqual({
      inline_keyboard: [
        [{ text: 'Join the waiting list', url: URL }],
        [{ text: 'Join the squad', url: SQUAD_URL }],
      ],
    });
  });

  it('players needed: singular when one short', () => {
    const text = buildOpenSlotPingMessage(ctx, { confirmedIn: 15, minPlayers: 16 }).text;
    expect(text).toContain('We need <b>1</b> more player for');
  });

  it('final call: appends the game-day URL when the inline button is unavailable', () => {
    const post = buildVacancyMessage(
      { ...ctx, appUrl: 'http://localhost:3000' },
      { promotedNames: [], remaining: 3, previouslyAnnounced: null, pingSent: false }
    )!;
    expect(post.buttons).toBeUndefined();
    expect(post.text).toContain('http://localhost:3000/s/wed/game-day/2026-09-23');
  });

  it('players needed: appends the game-day URL when the inline button is unavailable', () => {
    const post = buildOpenSlotPingMessage(
      { ...ctx, appUrl: 'http://localhost:3000' },
      { confirmedIn: 12, minPlayers: 16 }
    );
    expect(post.buttons).toBeUndefined();
    expect(post.text).toContain('http://localhost:3000/s/wed/game-day/2026-09-23');
    expect(post.text).toContain('http://localhost:3000/s/wed');
  });

  it('vacancy sync: all four cases, and silence when the group was never asked', () => {
    const v = (promotedNames: string[], remaining: number, extra: Partial<{ previouslyAnnounced: number | null; pingSent: boolean }> = {}) =>
      buildVacancyMessage(ctx, { promotedNames, remaining, previouslyAnnounced: null, pingSent: false, ...extra })?.text ?? null;

    expect(v(['Ada', 'Grace'], 2)).toMatch(/Ada, Grace are in .*\n2 spots still open/);
    const twoPartPromoted = v(['Ada Lovelace'], 1)!;
    expect(twoPartPromoted).toContain('Ada L is in');
    expect(twoPartPromoted).not.toContain('Lovelace');
    const fullSession = v(['Ada Lovelace'], 0)!;
    expect(fullSession).toContain('Assigned from the open slot waiting list for Wednesday 23 Sep, 19:00–22:00');
    expect(fullSession).toContain('✅ Ada L');
    expect(fullSession).not.toContain('Lovelace');
    expect(fullSession).toContain('The session is currently full.');
    expect(fullSession).toContain('\n\nJoin the waiting list to be next in line if someone cancels.');
    const finalCall = buildVacancyMessage(ctx, { promotedNames: [], remaining: 3, previouslyAnnounced: null, pingSent: false })!;
    expect(finalCall.text).toContain('Final call for open slots!');
    expect(finalCall.text).toContain('3 open slots for Wednesday 23 Sep, 19:00–22:00.');
    expect(finalCall.text).toContain('First come, first served.');
    expect(finalCall.text).not.toContain(URL);
    expect(finalCall.buttons).toEqual({ inline_keyboard: [[{ text: 'Claim a slot', url: URL }]] });
    expect(v([], 1)).toContain('1 open slot for');
    const filledUp = buildVacancyMessage(ctx, {
      promotedNames: [],
      remaining: 0,
      previouslyAnnounced: null,
      pingSent: true,
    })!;
    expect(filledUp.text).toContain('🔒 Wednesday 23 Sep, 19:00–22:00 filled up.');
    expect(filledUp.text).toContain('Currently no open slots available.');
    expect(filledUp.text).toContain('\n\nJoin the waiting list to be next in line if someone cancels.');
    expect(filledUp.text).not.toContain(URL);
    expect(filledUp.buttons).toEqual({
      inline_keyboard: [
        [{ text: 'Join the waiting list', url: URL }],
        [{ text: 'Join the squad', url: SQUAD_URL }],
      ],
    });
    expect(v([], 0, { previouslyAnnounced: 2 })).toContain('filled up.');
    expect(v([], 0)).toBeNull();
  });

  it('filled up: appends both URLs when the inline buttons are unavailable', () => {
    const post = buildVacancyMessage(
      { ...ctx, appUrl: 'http://localhost:3000' },
      { promotedNames: [], remaining: 0, previouslyAnnounced: null, pingSent: true }
    )!;
    expect(post.buttons).toBeUndefined();
    expect(post.text).toContain('http://localhost:3000/s/wed/game-day/2026-09-23');
    expect(post.text).toContain('http://localhost:3000/s/wed');
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

describe('slot hand-off posts (SINGLE_DAY_NOMINATION_PLAN.md)', () => {
  it('create, switch and end - names escaped, link via button only', () => {
    const created = buildNominationMessage(ctx, { kind: 'CREATED', nominatorName: 'Ada', nomineeName: 'Bob <3' });
    expect(created.text).toBe('🔁 Bob &lt; is playing for Ada\'s slot for Wednesday 23 Sep, 19:00–22:00');
    expect(created.text).not.toContain(URL);
    expect(created.buttons?.inline_keyboard[0][0].url).toBe(URL);

    const createdTwoPart = buildNominationMessage(ctx, {
      kind: 'CREATED',
      nominatorName: 'Ada Lovelace',
      nomineeName: 'Bob Smith',
    });
    expect(createdTwoPart.text).toContain('Bob S is playing for Ada L\'s slot');
    expect(createdTwoPart.text).not.toContain('Lovelace');
    expect(createdTwoPart.text).not.toContain('Smith');

    const switched = buildNominationMessage(ctx, {
      kind: 'SWITCHED',
      nominatorName: 'Ada Lovelace',
      nomineeName: 'Carol White',
      previousNomineeName: 'Bob Smith',
    });
    expect(switched.text).toBe(
      "🔁 Carol W is playing for Ada L's slot for Wednesday 23 Sep, 19:00–22:00 instead of Bob S."
    );
    expect(switched.text).not.toContain('Lovelace');
    expect(switched.text).not.toContain('Smith');
    expect(switched.text).not.toContain('White');

    const ended = buildNominationMessage(ctx, {
      kind: 'ENDED',
      nominatorName: 'Ada Lovelace',
      previousNomineeName: 'Bob Smith',
    });
    expect(ended.text).toBe("↩️ Bob S is no longer playing for Ada L's slot for Wednesday 23 Sep, 19:00–22:00.");
    expect(ended.text).not.toContain('Lovelace');
    expect(ended.text).not.toContain('Smith');
  });

  it('hand-off: appends the game-day URL when the inline button is unavailable', () => {
    const post = buildNominationMessage(
      { ...ctx, appUrl: 'http://localhost:3000' },
      { kind: 'CREATED', nominatorName: 'Ada', nomineeName: 'Bob' }
    );
    expect(post.buttons).toBeUndefined();
    expect(post.text).toContain('http://localhost:3000/s/wed/game-day/2026-09-23');
  });
});
