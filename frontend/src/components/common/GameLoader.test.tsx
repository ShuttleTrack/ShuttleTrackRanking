import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameLoader, PageLoader } from './GameLoader';

describe('GameLoader', () => {
  it('renders role status and aria-label', () => {
    const html = renderToStaticMarkup(<GameLoader label="Loading rankings" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading rankings"');
  });

  it('renders warming up caption for large size', () => {
    const html = renderToStaticMarkup(<GameLoader size="lg" label="Loading" />);
    expect(html).toContain('Warming up');
  });

  it('omits status role when decorative', () => {
    const html = renderToStaticMarkup(
      <GameLoader size="sm" label="Saving" caption={false} decorative />,
    );
    expect(html).not.toContain('role="status"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('uses rally swing class when motion is rally', () => {
    const html = renderToStaticMarkup(
      <GameLoader size="sm" label="Live" motion="rally" caption={false} decorative />,
    );
    expect(html).toContain('game-loader-racket-rally');
    expect(html).not.toContain('game-loader-racket-spin');
  });

  it('uses spin class by default', () => {
    const html = renderToStaticMarkup(<GameLoader size="sm" label="Loading" caption={false} />);
    expect(html).toContain('game-loader-racket-spin');
    expect(html).not.toContain('game-loader-racket-rally');
  });
});

describe('PageLoader', () => {
  it('wraps large GameLoader in a centered viewport block', () => {
    const html = renderToStaticMarkup(<PageLoader variant="tall" label="Loading" />);
    expect(html).toContain('min-h-[50vh]');
    expect(html).toContain('Warming up');
  });
});
