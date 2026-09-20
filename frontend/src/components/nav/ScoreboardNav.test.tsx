import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScoreboardNav } from './ScoreboardNav';

vi.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/',
    push: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

describe('ScoreboardNav', () => {
  it('marks Rankings as the current page on home', () => {
    const html = renderToStaticMarkup(
      <ScoreboardNav players={[]} playersLoading={false} />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('>Rankings<');
    expect(html).toContain('bg-primary/15');
  });
});
