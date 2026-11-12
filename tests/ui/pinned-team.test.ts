/**
 * The pin write and the focus after a pin or an unpin (components/prefs/use-pinned-team.ts,
 * components/home/FindYourTeam.tsx), against a minimal fake DOM — the suite runs in node.
 *
 * - With storage blocked, `pinTeam` changes nothing (no `html[data-pin]`, no remembered league)
 *   and returns false, so the finder never claims a pin it could not store.
 * - After an unpin with "All" remembered, focus goes to the first-visit finder (or its heading),
 *   never `<body>`. The home My-team slot (`.sx-myteam-slot`, `#my-team-heading`) is retired
 *   (DESIGN §33), so nothing here names it.
 * - An element far off screen is not "near": an unpin never jumps the page to it.
 * - After a pin from "Find your team" (which hides the block), focus goes to the team's league tab,
 *   else to the main landmark.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { afterPinTarget } from '../../components/home/FindYourTeam';
import { isNearViewport, pinTeam, unpinFallbackTarget } from '../../components/prefs/use-pinned-team';

type Attrs = Map<string, string>;

function fakeElement(rendered: boolean, attrs: Record<string, string> = {}) {
  const map: Attrs = new Map(Object.entries(attrs));
  return {
    rendered,
    focused: false,
    getClientRects: () => (rendered ? [{}] : []),
    hasAttribute: (n: string) => map.has(n),
    getAttribute: (n: string) => map.get(n) ?? null,
    setAttribute: (n: string, v: string) => void map.set(n, v),
    removeAttribute: (n: string) => void map.delete(n),
    focus() {
      this.focused = true;
    },
  };
}

function install(opts: {
  storage: 'ok' | 'blocked';
  bySelector?: Record<string, ReturnType<typeof fakeElement>[]>;
  byId?: Record<string, ReturnType<typeof fakeElement>>;
}) {
  const html = fakeElement(true);
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => {
      if (opts.storage === 'blocked') throw new Error('SecurityError');
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.storage === 'blocked') throw new Error('SecurityError');
      store.set(k, v);
    },
    removeItem: (k: string) => {
      if (opts.storage === 'blocked') throw new Error('SecurityError');
      store.delete(k);
    },
  };
  const g = globalThis as Record<string, unknown>;
  g.window = { localStorage, dispatchEvent: () => true, innerHeight: 800 };
  g.document = {
    documentElement: html,
    querySelectorAll: (sel: string) => opts.bySelector?.[sel] ?? [],
    getElementById: (id: string) => opts.byId?.[id] ?? null,
  };
  return { html, store };
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.window;
  delete g.document;
});

describe('pinTeam', () => {
  it('storage blocked: returns false and stamps nothing (no data-pin, no data-league)', () => {
    const { html } = install({ storage: 'blocked' });
    expect(pinTeam('leigh', 'bval')).toBe(false);
    expect(html.hasAttribute('data-pin')).toBe(false);
    expect(html.hasAttribute('data-league')).toBe(false);
  });

  it('storage available: stores the slug, stamps data-pin and remembers the league', () => {
    const { html, store } = install({ storage: 'ok' });
    expect(pinTeam('leigh', 'bval')).toBe(true);
    expect(html.getAttribute('data-pin')).toBe('leigh');
    expect(html.getAttribute('data-league')).toBe('bval');
    expect([...store.values()]).toEqual(expect.arrayContaining(['leigh', 'bval']));
  });
});

describe('focus after an unpin', () => {
  it('pin + "All" + unpin: focus goes to the first-visit finder', () => {
    const firstVisitField = fakeElement(true);
    install({
      storage: 'ok',
      bySelector: {
        '[data-scope="none"] input[type="search"]': [fakeElement(false), firstVisitField],
      },
    });
    expect(unpinFallbackTarget()).toBe(firstVisitField);
  });

  it('an element far below the viewport is not near (no long scroll jump); one on screen is', () => {
    const far = Object.assign(fakeElement(true), {
      getBoundingClientRect: () => ({ top: 1800, bottom: 1860 }),
    });
    const near = Object.assign(fakeElement(true), {
      getBoundingClientRect: () => ({ top: 400, bottom: 460 }),
    });
    install({ storage: 'ok' });
    expect(isNearViewport(far as unknown as Element)).toBe(false);
    expect(isNearViewport(near as unknown as Element)).toBe(true);
  });

  it('no finder rendered (no JS styles yet): the first-visit heading, made focusable', () => {
    const heading = fakeElement(true);
    install({ storage: 'ok', byId: { 'find-your-team': heading } });
    expect(unpinFallbackTarget()).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });
});

describe('focus after a pin from "Find your team" (the block hides once a league is remembered)', () => {
  it('goes to the rendered tab of the team’s league', () => {
    const hiddenCopy = fakeElement(false);
    const tab = fakeElement(true);
    const main = fakeElement(true);
    install({
      storage: 'ok',
      bySelector: { 'button[data-league-option="bval"]': [hiddenCopy, tab] },
      byId: { main },
    });
    expect(afterPinTarget('bval')).toBe(tab);
    expect(main.hasAttribute('tabindex')).toBe(false);
  });

  it('the tab is not on screen (the other region’s league): the main landmark, made focusable, never <body>', () => {
    const main = fakeElement(true);
    install({
      storage: 'ok',
      bySelector: { 'button[data-league-option="city"]': [fakeElement(false)] },
      byId: { main },
    });
    expect(afterPinTarget('city')).toBe(main);
    expect(main.getAttribute('tabindex')).toBe('-1');
  });
});
