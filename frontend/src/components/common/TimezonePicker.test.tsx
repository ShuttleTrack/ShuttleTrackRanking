import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TimezonePicker } from './TimezonePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(value: string, onChange = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<TimezonePicker value={value} onChange={onChange} label="Timezone" />));
  return { onChange, input: host.querySelector('input')! };
}

// React tracks an input's value itself, so setting .value directly would not fire onChange.
function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const optionTexts = () => Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent ?? '');

describe('TimezonePicker', () => {
  it('shows the current zone and its offset', () => {
    const { input } = render('Europe/Amsterdam');
    expect(input.value).toBe('Europe/Amsterdam');
    expect(host!.textContent).toMatch(/UTC\+0[12]:00/);
  });

  it('offers the short common list before anything is typed, not all ~400 zones', () => {
    const { input } = render('Europe/Amsterdam');
    act(() => {
      (host!.querySelector('button') as HTMLButtonElement).click();
    });
    void input;
    const options = optionTexts();
    expect(options.length).toBeGreaterThan(3);
    expect(options.length).toBeLessThan(15);
    expect(document.body.textContent).toMatch(/type to search all \d+ zones/);
  });

  it('searches every zone by city and emits the chosen IANA id', () => {
    const { input, onChange } = render('Europe/Amsterdam');
    type(input, 'buenos');
    expect(optionTexts()[0]).toContain('Buenos Aires');
    // Keyboard selection: first match, Enter.
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    // The exact id varies by ICU version (America/Buenos_Aires vs America/Argentina/Buenos_Aires).
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatch(/^America\/(Argentina\/)?Buenos_Aires$/);
  });

  it('searches by UTC offset', () => {
    const { input } = render('Europe/Amsterdam');
    type(input, '+05:30');
    expect(optionTexts().some((t) => t.includes('Colombo'))).toBe(true);
  });

  it('says so when nothing matches, and never emits free text', () => {
    const { input, onChange } = render('Europe/Amsterdam');
    type(input, 'xyzzy');
    expect(document.body.textContent).toContain('No timezone matches');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a stored zone that is not in the common list selectable', () => {
    const { input } = render('Pacific/Auckland');
    expect(input.value).toBe('Pacific/Auckland');
  });
});
