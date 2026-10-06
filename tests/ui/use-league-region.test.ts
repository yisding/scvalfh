/**
 * `setRegion` (components/ui/use-league.ts) against the real prefs script (DESIGN-socal §2.4).
 *
 * The 2026-10-06 review found that a NorCal → SoCal → NorCal round trip lost the pinned team's
 * league for good: setRegion wrote `scvalfh.league = 'all'` when the stamped league was in the other
 * region, and the prefs script reads a stored `'all'` as "never derive a league from the pin". It now
 * REMOVES the key, so the stored region decides, and re-runs the script's own precedence. These cases
 * run the exact script string in a `node:vm` context whose `window`, `document` and `localStorage` are
 * the globals use-league.ts reads, then drive `setRegion` the way the region switcher does.
 */
import vm from 'node:vm';

import { afterEach, describe, expect, it } from 'vitest';

import { LEAGUE_KEY, REGION_KEY, buildPrefsScript } from '../../components/layout/prefs-script';
import { PINNED_TEAM_KEY } from '../../components/layout/pinned-team-script';
import { setRegion } from '../../components/ui/use-league';
import { DEFAULT_REGION, LEAGUE_IDS, regionOf } from '../../lib/leagues';
import { TEAMS } from '../../lib/teams';

const SCRIPT = buildPrefsScript({
  leagueIds: LEAGUE_IDS,
  slugLeague: Object.fromEntries(TEAMS.map((t) => [t.slug, t.league])),
  leagueRegion: Object.fromEntries(LEAGUE_IDS.map((id) => [id, regionOf(id)])),
  defaultRegion: DEFAULT_REGION,
});

class FakeHtml {
  attrs = new Map<string, string>();
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  getAttribute(k: string) {
    return this.attrs.has(k) ? this.attrs.get(k)! : null;
  }
}

const g = globalThis as unknown as Record<string, unknown>;
const saved = { window: g.window, document: g.document, localStorage: g.localStorage };

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete g[k];
    else g[k] = v;
  }
});

/** A page load: the script stamps `<html>` from `stored`; use-league.ts then sees the same globals. */
function load(stored: Map<string, string>, throws = false) {
  const html = new FakeHtml();
  const blocked = () => {
    throw new Error('SecurityError: storage is blocked');
  };
  const localStorage = throws
    ? { getItem: blocked, setItem: blocked, removeItem: blocked }
    : {
        getItem: (k: string) => stored.get(k) ?? null,
        setItem: (k: string, v: string) => void stored.set(k, String(v)),
        removeItem: (k: string) => void stored.delete(k),
      };
  const context: Record<string, unknown> = {
    document: { documentElement: html },
    localStorage,
    dispatchEvent: () => true,
  };
  context.window = context;
  vm.runInNewContext(SCRIPT, context);
  g.window = context;
  g.document = context.document;
  g.localStorage = localStorage;
  return { html, attrs: () => Object.fromEntries(html.attrs), restamp: () => (context.__sxPrefs as () => void)() };
}

describe('setRegion keeps the pinned team’s league across a round trip', () => {
  for (const withLeague of [false, true]) {
    it(`pin leigh${withLeague ? ' with bval stored' : ''}: SoCal hides BVAL, NorCal brings it back`, () => {
      const stored = new Map<string, string>([[PINNED_TEAM_KEY, 'leigh']]);
      if (withLeague) stored.set(LEAGUE_KEY, 'bval');
      const page = load(stored);
      expect(page.attrs()).toEqual({ 'data-js': '', 'data-league': 'bval', 'data-pin': 'leigh' });

      setRegion('socal');
      expect(page.attrs()).toEqual({ 'data-js': '', 'data-pin': 'leigh', 'data-region': 'socal' });
      expect(stored.has(LEAGUE_KEY)).toBe(false);
      expect(stored.get(REGION_KEY)).toBe('socal');

      setRegion('norcal');
      expect(page.attrs()).toEqual({ 'data-js': '', 'data-league': 'bval', 'data-pin': 'leigh' });
      expect(stored.has(LEAGUE_KEY)).toBe(false);
      expect(stored.get(REGION_KEY)).toBe('norcal');

      // A cross-tab restamp and a reload agree.
      page.restamp();
      expect(page.attrs()).toEqual({ 'data-js': '', 'data-league': 'bval', 'data-pin': 'leigh' });
      expect(load(stored).attrs()).toEqual({ 'data-js': '', 'data-league': 'bval', 'data-pin': 'leigh' });
    });
  }

  it('a reload while on SoCal keeps SoCal with no league; NorCal then restores BVAL', () => {
    const stored = new Map<string, string>([
      [PINNED_TEAM_KEY, 'leigh'],
      [LEAGUE_KEY, 'bval'],
    ]);
    load(stored);
    setRegion('socal');
    const page = load(stored);
    expect(page.attrs()).toEqual({ 'data-js': '', 'data-pin': 'leigh', 'data-region': 'socal' });
    setRegion('norcal');
    expect(page.attrs()).toEqual({ 'data-js': '', 'data-league': 'bval', 'data-pin': 'leigh' });
  });

  it('an explicit "all" is never touched', () => {
    const stored = new Map<string, string>([
      [PINNED_TEAM_KEY, 'leigh'],
      [LEAGUE_KEY, 'all'],
    ]);
    const page = load(stored);
    expect(page.attrs()).toEqual({ 'data-js': '', 'data-pin': 'leigh' });
    setRegion('socal');
    expect(stored.get(LEAGUE_KEY)).toBe('all');
    expect(page.attrs()).toEqual({ 'data-js': '', 'data-pin': 'leigh', 'data-region': 'socal' });
    setRegion('norcal');
    expect(stored.get(LEAGUE_KEY)).toBe('all');
    expect(page.attrs()).toEqual({ 'data-js': '', 'data-pin': 'leigh' });
  });

  it('a stored league of the chosen region is kept', () => {
    const stored = new Map<string, string>([[LEAGUE_KEY, 'metro']]);
    const page = load(stored);
    setRegion('socal');
    expect(stored.get(LEAGUE_KEY)).toBe('metro');
    expect(page.attrs()).toEqual({ 'data-js': '', 'data-league': 'metro', 'data-region': 'socal' });
  });

  it('storage throwing: the stamps still switch for this page view, and nothing re-runs the script', () => {
    const stored = new Map<string, string>();
    const page = load(stored, true);
    page.html.setAttribute('data-league', 'bval');
    setRegion('socal');
    expect(page.attrs()).toEqual({ 'data-js': '', 'data-region': 'socal' });
    setRegion('norcal');
    expect(page.attrs()).toEqual({ 'data-js': '' });
  });
});
