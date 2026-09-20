import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScoreboardNav } from './ScoreboardNav';
import { SquadProvider } from '@/contexts/SquadContext';

vi.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/s/[squad]',
    asPath: '/s/main',
    push: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

const squad = { id: 1, slug: 'main', name: 'Main Squad', isSquadAdmin: false, isPlayerHere: false };

describe('ScoreboardNav', () => {
  it('marks Rankings as the current page on home', () => {
    const html = renderToStaticMarkup(
      <SquadProvider squad={squad}>
        <ScoreboardNav players={[]} playersLoading={false} />
      </SquadProvider>,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('>Rankings<');
    expect(html).toContain('bg-primary/15');
  });

  it('renders nothing without a squad in context', () => {
    const html = renderToStaticMarkup(
      <ScoreboardNav players={[]} playersLoading={false} />,
    );
    expect(html).toBe('');
  });
});
