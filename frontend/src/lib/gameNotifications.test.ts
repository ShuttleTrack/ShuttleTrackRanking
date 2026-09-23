import { describe, it, expect } from 'vitest';
import { buildGameMessage, isGameEvent, type GameMessageContext } from './gameNotifications';

const ctx: GameMessageContext = {
  appUrl: 'https://brs.example.com/',
  squadName: 'Wed <Smashers> & Co',
  slug: 'wed',
  gameId: 'clxyz0000abcd',
};

describe('buildGameMessage', () => {
  it('started: links the squad-scoped game viewer, in the text and as a button', () => {
    const url = 'https://brs.example.com/s/wed/game-viewer?gameId=clxyz0000abcd';
    const post = buildGameMessage('started', ctx);
    expect(post.text).toContain('Game #abcd has started');
    expect(post.text).toContain('Wed &lt;Smashers&gt; &amp; Co');
    expect(post.text.endsWith(url)).toBe(true);
    expect(post.buttons).toEqual({ inline_keyboard: [[{ text: '📊 Track Scores', url }]] });
  });

  it('completed: links the squad ranking board', () => {
    const url = 'https://brs.example.com/s/wed';
    const post = buildGameMessage('completed', ctx);
    expect(post.text).toContain('Game #abcd has been completed');
    expect(post.text.endsWith(url)).toBe(true);
    expect(post.buttons).toEqual({ inline_keyboard: [[{ text: '🏆 Check Rankings', url }]] });
  });

  it('cancelled: no link', () => {
    const post = buildGameMessage('cancelled', ctx);
    expect(post.text).toContain('Game #abcd has been cancelled');
    expect(post.buttons).toBeUndefined();
  });

  it('drops the button (keeps the text link) for a localhost app URL', () => {
    const post = buildGameMessage('started', { ...ctx, appUrl: 'http://localhost:3333' });
    expect(post.text).toContain('http://localhost:3333/s/wed/game-viewer?gameId=clxyz0000abcd');
    expect(post.buttons).toBeUndefined();
  });
});

describe('isGameEvent', () => {
  it('accepts only the three events', () => {
    expect(isGameEvent('started')).toBe(true);
    expect(isGameEvent('completed')).toBe(true);
    expect(isGameEvent('cancelled')).toBe(true);
    expect(isGameEvent('deleted')).toBe(false);
    expect(isGameEvent(undefined)).toBe(false);
  });
});
