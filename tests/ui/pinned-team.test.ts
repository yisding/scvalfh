/**
 * The pin write and the focus after an unpin (components/ui/use-pinned-team.ts,
 * components/home/MyTeamCard.tsx), against a minimal fake DOM — the suite runs in node.
 *
 * - With storage blocked, `pinTeam` changes nothing (no `html[data-pin]`, no remembered league)
 *   and returns false, so the finder never leaves an empty My-team box with no Unpin.
 * - After an unpin with "All" remembered, the My-team slot hides; focus goes to the first-visit
 *   finder (or its heading), never `<body>`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { unpinFocusTarget } from '../../components/home/MyTeamCard';
import { pinTeam, unpinFallbackTarget } from '../../components/ui/use-pinned-team';

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
  g.window = { localStorage, dispatchEvent: () => true };
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
  it('pin + "All" + unpin: the slot is hidden, so focus goes to the first-visit finder', () => {
    const hiddenSlotField = fakeElement(false);
    const firstVisitField = fakeElement(true);
    install({
      storage: 'ok',
      bySelector: {
        '[data-pin-tile="leigh"]': [fakeElement(false)],
        '.sx-myteam-slot input[type="search"]': [hiddenSlotField],
        '[data-scope="none"] input[type="search"]': [firstVisitField],
      },
    });
    expect(unpinFocusTarget('leigh')).toBe(firstVisitField);
    expect(unpinFallbackTarget()).toBe(firstVisitField);
  });

  it('prefers the rendered tile, then the slot finder', () => {
    const tile = fakeElement(true);
    const slotField = fakeElement(true);
    install({
      storage: 'ok',
      bySelector: {
        '[data-pin-tile="leigh"]': [tile],
        '.sx-myteam-slot input[type="search"]': [slotField],
        '[data-scope="none"] input[type="search"]': [fakeElement(true)],
      },
    });
    expect(unpinFocusTarget('leigh')).toBe(tile);
    expect(unpinFocusTarget(null)).toBe(slotField);
  });

  it('no finder rendered (no JS styles yet): the first-visit heading, made focusable', () => {
    const heading = fakeElement(true);
    install({ storage: 'ok', byId: { 'find-your-team': heading } });
    expect(unpinFallbackTarget()).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });
});
