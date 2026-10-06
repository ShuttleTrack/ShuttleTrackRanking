import { describe, it, expect } from 'vitest';
import { buildGameMessage, gameEventGroups, isGameEvent, type GameMessageContext } from './gameNotifications';

const ctx: GameMessageContext = {
  appUrl: 'https://brs.example.com/',
  squadName: 'Wed <Smashers> & Co',
  slug: 'wed',
  gameId: 'clxyz0000abcd',
};

describe('buildGameMessage', () => {
  it('started: links the squad-scoped game viewer via button only', () => {
    const url = 'https://brs.example.com/s/wed/game-viewer?gameId=clxyz0000abcd';
    const post = buildGameMessage('started', ctx);
    expect(post.text).toBe(
      '🏸 <b>Wed &lt;Smashers&gt; &amp; Co — Game #abcd has started!</b>\nTrack live scores and game combinations.'
    );
    expect(post.text).not.toContain(url);
    expect(post.buttons).toEqual({ inline_keyboard: [[{ text: '📊 Track Scores', url }]] });
  });

  it('completed: headline only, ranking board via button', () => {
    const url = 'https://brs.example.com/s/wed';
    const post = buildGameMessage('completed', ctx);
    expect(post.text).toBe('🏆 <b>Wed &lt;Smashers&gt; &amp; Co — Game #abcd has been completed!</b>');
    expect(post.text).not.toContain('Scores have been processed');
    expect(post.text).not.toContain(url);
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

describe('gameEventGroups', () => {
  const chatIds = { main: '-100main', openSlot: '-100open' };

  it('adds the open-slot group for a public squad on start and completion', () => {
    expect(gameEventGroups('started', { isPublic: true }, chatIds)).toEqual(['main', 'openSlot']);
    expect(gameEventGroups('completed', { isPublic: true }, chatIds)).toEqual(['main', 'openSlot']);
  });

  it('keeps cancellations main-only', () => {
    expect(gameEventGroups('cancelled', { isPublic: true }, chatIds)).toEqual(['main']);
  });

  it('keeps a private squad main-only', () => {
    expect(gameEventGroups('started', { isPublic: false }, chatIds)).toEqual(['main']);
    expect(gameEventGroups('completed', { isPublic: false }, chatIds)).toEqual(['main']);
  });

  it('skips the open-slot group when unset or the same chat as main', () => {
    expect(gameEventGroups('started', { isPublic: true }, { main: '-100main', openSlot: null })).toEqual(['main']);
    expect(gameEventGroups('started', { isPublic: true }, { main: '-100x', openSlot: '-100x' })).toEqual(['main']);
  });
});
