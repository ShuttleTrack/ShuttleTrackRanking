import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveGamesControl } from './LiveGamesControl';
import { SquadProvider } from '@/contexts/SquadContext';

const squad = { id: 1, slug: 'main', name: 'Main Squad', isSquadAdmin: false, isPlayerHere: false, openForOpenSlot: false };

describe('LiveGamesControl', () => {
  it('renders nothing when there are no live games', () => {
    const html = renderToStaticMarkup(
      <SquadProvider squad={squad}>
        <LiveGamesControl liveGames={[]} isLoading={false} />
      </SquadProvider>,
    );
    expect(html).toBe('');
  });

  it('renders nothing without a squad in context, even with live games', () => {
    const html = renderToStaticMarkup(
      <LiveGamesControl
        liveGames={[{ id: 'abc12345', progress: 40, createdAt: '2026-01-01' }]}
        isLoading={false}
      />,
    );
    expect(html).toBe('');
  });

  it('links directly when exactly one live game', () => {
    const html = renderToStaticMarkup(
      <SquadProvider squad={squad}>
        <LiveGamesControl
          liveGames={[{ id: 'abc12345', progress: 40, createdAt: '2026-01-01' }]}
          isLoading={false}
        />
      </SquadProvider>,
    );
    expect(html).toContain('/s/main/game-viewer?gameId=abc12345');
    expect(html).toContain('game-loader-racket-rally');
    expect(html).not.toContain('ChevronDownIcon');
  });

  it('renders a menu trigger when multiple live games', () => {
    const html = renderToStaticMarkup(
      <SquadProvider squad={squad}>
        <LiveGamesControl
          liveGames={[
            { id: 'game-one', progress: 10, createdAt: '2026-01-01' },
            { id: 'game-two', progress: 90, createdAt: '2026-01-02' },
          ]}
          isLoading={false}
        />
      </SquadProvider>,
    );
    expect(html).toContain('game-loader-racket-rally');
    expect(html).toContain('aria-haspopup="menu"');
  });
});
