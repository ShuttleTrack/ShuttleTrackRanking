import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavLogo } from './NavLogo';
import { SquadProvider } from '@/contexts/SquadContext';

const squad = { id: 1, slug: 'main', name: 'Main Squad', isSquadAdmin: false, isPlayerHere: false };

describe('NavLogo', () => {
  it('links to squad rankings when squad is in context', () => {
    const html = renderToStaticMarkup(
      <SquadProvider squad={squad}>
        <NavLogo />
      </SquadProvider>,
    );
    expect(html).toContain('href="/s/main"');
  });

  it('links to root when no squad in context', () => {
    const html = renderToStaticMarkup(<NavLogo />);
    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/s/');
  });
});
