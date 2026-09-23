import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PublicLiveGames from './PublicLiveGames';

describe('PublicLiveGames', () => {
  it('renders nothing when no game is live', () => {
    expect(renderToStaticMarkup(<PublicLiveGames games={[]} />)).toBe('');
  });

  it("links each game to its squad's public game viewer", () => {
    const html = renderToStaticMarkup(
      <PublicLiveGames
        games={[
          { id: 'aaaa1111', progress: 40, createdAt: '2026-09-23', squad: { slug: 'alpha', name: 'Alpha' } },
          { id: 'bbbb2222', progress: 0, createdAt: '2026-09-23', squad: { slug: 'beta', name: 'Beta' } },
        ]}
      />,
    );
    expect(html).toContain('href="/s/alpha/game-viewer?gameId=aaaa1111"');
    expect(html).toContain('href="/s/beta/game-viewer?gameId=bbbb2222"');
    expect(html).toContain('Alpha');
    expect(html).toContain('Game #1111');
    expect(html).toContain('40%');
  });
});
