/**
 * The pre-paint prefs stamp (components/layout/prefs-script.ts, SPEC §8.2), evaluated as the
 * browser would run it: the exact script string in a `node:vm` context with a fake `localStorage`,
 * `document.documentElement` and `window`.
 */
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  LEAGUE_KEY,
  PREFS_RESTAMP,
  REGION_KEY,
  REGION_OF,
  REGION_OPEN,
  REGION_PICKED,
  buildPrefsScript,
} from '../../components/layout/prefs-script';
import { PINNED_TEAM_KEY, PINNED_TEAM_SCRIPT } from '../../components/layout/pinned-team-script';
import { TEAMS } from '../../lib/teams';
import { DEFAULT_REGION, LEAGUE_IDS, regionOf } from '../../lib/leagues';

const SLUG_LEAGUE = Object.fromEntries(TEAMS.map((t) => [t.slug, t.league]));
const LEAGUE_REGION = Object.fromEntries(LEAGUE_IDS.map((id) => [id, regionOf(id)]));
const INPUT = { leagueIds: LEAGUE_IDS, slugLeague: SLUG_LEAGUE, leagueRegion: LEAGUE_REGION, defaultRegion: DEFAULT_REGION };
const SCRIPT = buildPrefsScript(INPUT);

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

function run(stored: Record<string, string> | 'throws', html = new FakeHtml()) {
  const localStorage =
    stored === 'throws'
      ? {
          getItem() {
            throw new Error('SecurityError: storage is blocked');
          },
        }
      : { getItem: (k: string) => (k in stored ? stored[k] : null) };
  const context: Record<string, unknown> = { document: { documentElement: html }, localStorage };
  context.window = context;
  vm.runInNewContext(SCRIPT, context);
  return { attrs: Object.fromEntries(html.attrs), context, html };
}

const scvalSlug = TEAMS.find((t) => t.league === 'scval')!.slug;
const bvalSlug = TEAMS.find((t) => t.league === 'bval')!.slug;
const mcalSlug = TEAMS.find((t) => t.league === 'mcal')!.slug;
const sunsetSlug = TEAMS.find((t) => t.league === 'sunset')!.slug;
const metroSlug = TEAMS.find((t) => t.league === 'metro')!.slug;

describe('buildPrefsScript', () => {
  // The line was 2,048 B for 49 teams and 5 leagues (1,317 B measured). With 99 teams, the
  // league→region map and the region precedence it measured 2,454 B on 2026-10-06 (the design
  // estimated 2.2–2.4 KB and proposed a 3,072 B line), and the line became the measurement × 1.12
  // rounded up to 256 B: 2,748 → 2,816 B. The LA independents (DESIGN §24.9: three
  // slugs and one more league id, in L, G and R) took it to 2,537 B the same day; by the same rule
  // 2,537 × 1.12 = 2,842 → 3,072 B, 83 % used. The region pick's two listeners (a jump link's
  // `:target` no longer holds the other region open) took it to 3,018 B on 2026-10-18, 98 % used:
  // they live here because /teams had no first-load JS left for them (scripts/assert-budgets.ts).
  // Clearing it on popstate as well took it to 3,052 B, 99 % used. The client-side deep link (a
  // `<Link>` to another page's fragment in the hidden region: the link-tap wait and the
  // data-region-open marks) took it to 3,581 B on 2026-10-18; by the same rule 3,581 × 1.12 =
  // 4,011 → 4,096 B, 87 % used.
  it('stays within 4,096 B including the 102-entry slug map', () => {
    expect(TEAMS.length).toBe(102);
    expect(Buffer.byteLength(SCRIPT, 'utf8')).toBeLessThanOrEqual(4096);
  });

  it('ships the region map once, non-default regions only: R={"socal":"sunset city north-county metro independents"}', () => {
    expect(SCRIPT).toContain('R={"socal":"sunset city north-county metro independents"}');
    expect(SCRIPT).not.toContain('"norcal":');
  });

  it('has no character that could close the <script>', () => {
    expect(SCRIPT).not.toMatch(/<\/?script/i);
    expect(SCRIPT).not.toContain('<');
  });

  it('nothing stored: only data-js', () => {
    expect(run({}).attrs).toEqual({ 'data-js': '' });
  });

  it('a stored league: data-league', () => {
    expect(run({ [LEAGUE_KEY]: 'bval' }).attrs).toEqual({ 'data-js': '', 'data-league': 'bval' });
  });

  it("stored 'all' removes the league, even with a pin", () => {
    expect(run({ [LEAGUE_KEY]: 'all' }).attrs).toEqual({ 'data-js': '' });
    expect(run({ [LEAGUE_KEY]: 'all', [PINNED_TEAM_KEY]: bvalSlug }).attrs).toEqual({
      'data-js': '',
      'data-pin': bvalSlug,
    });
  });

  it('an unknown stored league is ignored (falls back to the pin, else none)', () => {
    expect(run({ [LEAGUE_KEY]: 'wcal' }).attrs).toEqual({ 'data-js': '' });
    expect(run({ [LEAGUE_KEY]: 'wcal', [PINNED_TEAM_KEY]: mcalSlug }).attrs).toEqual({
      'data-js': '',
      'data-league': 'mcal',
      'data-pin': mcalSlug,
    });
  });

  it("a pin only: data-pin and the pinned team's league", () => {
    expect(run({ [PINNED_TEAM_KEY]: scvalSlug }).attrs).toEqual({
      'data-js': '',
      'data-league': 'scval',
      'data-pin': scvalSlug,
    });
  });

  it('a stored league wins over the pinned team’s league', () => {
    expect(run({ [LEAGUE_KEY]: 'pcal', [PINNED_TEAM_KEY]: scvalSlug }).attrs).toEqual({
      'data-js': '',
      'data-league': 'pcal',
      'data-pin': scvalSlug,
    });
  });

  it('a stale pin (not a known slug): data-pin-stale, no data-pin, no league from it', () => {
    expect(run({ [PINNED_TEAM_KEY]: 'gone-high' }).attrs).toEqual({ 'data-js': '', 'data-pin-stale': '' });
    expect(run({ [PINNED_TEAM_KEY]: 'gone-high', [LEAGUE_KEY]: 'mcal' }).attrs).toEqual({
      'data-js': '',
      'data-league': 'mcal',
      'data-pin-stale': '',
    });
    // Prototype keys are not slugs.
    expect(run({ [PINNED_TEAM_KEY]: 'constructor' }).attrs).toEqual({ 'data-js': '', 'data-pin-stale': '' });
  });

  it('storage throwing: data-js only, and no exception escapes', () => {
    expect(run('throws').attrs).toEqual({ 'data-js': '' });
  });

  it('leaves a re-stamp function that clears attributes the new values no longer support', () => {
    const stored: Record<string, string> = { [LEAGUE_KEY]: 'bval', [PINNED_TEAM_KEY]: bvalSlug };
    const html = new FakeHtml();
    const localStorage = { getItem: (k: string) => (k in stored ? stored[k] : null) };
    const context: Record<string, unknown> = { document: { documentElement: html }, localStorage };
    context.window = context;
    vm.runInNewContext(SCRIPT, context);
    expect(Object.fromEntries(html.attrs)).toEqual({ 'data-js': '', 'data-league': 'bval', 'data-pin': bvalSlug });
    stored[LEAGUE_KEY] = 'all';
    delete stored[PINNED_TEAM_KEY];
    (context[PREFS_RESTAMP] as () => void)();
    expect(Object.fromEntries(html.attrs)).toEqual({ 'data-js': '' });
  });

  it('rejects an id or slug that could break out of the string', () => {
    const base = { leagueRegion: { scval: 'norcal' }, defaultRegion: 'norcal' };
    expect(() => buildPrefsScript({ ...base, leagueIds: ["x'y"], slugLeague: {} })).toThrow();
    expect(() => buildPrefsScript({ ...base, leagueIds: ['scval'], slugLeague: { 'a</script>': 'scval' } })).toThrow();
    expect(() => buildPrefsScript({ ...base, leagueIds: ['scval'], slugLeague: { a: 'nope' } })).toThrow();
    // A league with no region, a region that could break out, a default other than the stampless one.
    expect(() => buildPrefsScript({ ...base, leagueIds: ['scval', 'bval'], slugLeague: {} })).toThrow();
    expect(() =>
      buildPrefsScript({ ...base, leagueIds: ['scval'], slugLeague: {}, leagueRegion: { scval: 'x"y' } }),
    ).toThrow();
    expect(() => buildPrefsScript({ ...base, leagueIds: ['scval'], slugLeague: {}, defaultRegion: 'socal' })).toThrow();
  });
});

/**
 * The region stamp (DESIGN-socal §2.4): `data-region="socal"` only, absent = NorCal. Precedence: a
 * valid stored league wins (its region); else a valid stored region (the pin's league only if it is
 * in that region); else a valid pin; else NorCal.
 */
describe('buildPrefsScript: the region', () => {
  it('a stored SoCal league stamps its league and data-region="socal"', () => {
    expect(run({ [LEAGUE_KEY]: 'city' }).attrs).toEqual({ 'data-js': '', 'data-league': 'city', 'data-region': 'socal' });
    expect(run({ [LEAGUE_KEY]: 'sunset' }).attrs).toEqual({
      'data-js': '',
      'data-league': 'sunset',
      'data-region': 'socal',
    });
  });

  it('a stored league beats a stored region, both ways', () => {
    expect(run({ [LEAGUE_KEY]: 'metro', [REGION_KEY]: 'norcal' }).attrs).toEqual({
      'data-js': '',
      'data-league': 'metro',
      'data-region': 'socal',
    });
    expect(run({ [LEAGUE_KEY]: 'bval', [REGION_KEY]: 'socal' }).attrs).toEqual({ 'data-js': '', 'data-league': 'bval' });
  });

  it('a stored region socal with a NorCal pin: SoCal, the pin kept, no league from it', () => {
    expect(run({ [REGION_KEY]: 'socal', [PINNED_TEAM_KEY]: scvalSlug }).attrs).toEqual({
      'data-js': '',
      'data-pin': scvalSlug,
      'data-region': 'socal',
    });
  });

  it('a stored region with a pin in that region: the pin’s league', () => {
    expect(run({ [REGION_KEY]: 'socal', [PINNED_TEAM_KEY]: metroSlug }).attrs).toEqual({
      'data-js': '',
      'data-league': 'metro',
      'data-pin': metroSlug,
      'data-region': 'socal',
    });
    expect(run({ [REGION_KEY]: 'norcal', [PINNED_TEAM_KEY]: sunsetSlug }).attrs).toEqual({
      'data-js': '',
      'data-pin': sunsetSlug,
    });
  });

  it('a SoCal pin and nothing else: its league and region; with "all" stored, its region only', () => {
    expect(run({ [PINNED_TEAM_KEY]: sunsetSlug }).attrs).toEqual({
      'data-js': '',
      'data-league': 'sunset',
      'data-pin': sunsetSlug,
      'data-region': 'socal',
    });
    expect(run({ [LEAGUE_KEY]: 'all', [PINNED_TEAM_KEY]: sunsetSlug }).attrs).toEqual({
      'data-js': '',
      'data-pin': sunsetSlug,
      'data-region': 'socal',
    });
    expect(run({ [LEAGUE_KEY]: 'all', [REGION_KEY]: 'socal' }).attrs).toEqual({ 'data-js': '', 'data-region': 'socal' });
  });

  it('an unknown or prototype-key stored region is ignored', () => {
    expect(run({ [REGION_KEY]: 'mars' }).attrs).toEqual({ 'data-js': '' });
    expect(run({ [REGION_KEY]: 'constructor' }).attrs).toEqual({ 'data-js': '' });
    expect(run({ [REGION_KEY]: 'mars', [PINNED_TEAM_KEY]: metroSlug }).attrs).toEqual({
      'data-js': '',
      'data-league': 'metro',
      'data-pin': metroSlug,
      'data-region': 'socal',
    });
  });

  it('leaves window.__sxRegionOf: a league’s region, null for anything else', () => {
    const { context } = run({});
    const regionOfLeague = context[REGION_OF] as (l: string) => string | null;
    for (const id of LEAGUE_IDS) expect(regionOfLeague(id)).toBe(regionOf(id));
    expect(regionOfLeague('all')).toBeNull();
    expect(regionOfLeague('constructor')).toBeNull();
  });

  /**
   * Pinning a team of the other region while storage throws (design-review UI §5): setLeague stamps
   * data-league and data-region from __sxRegionOf BEFORE its writes fail, and nothing re-runs the
   * stamp from (empty) storage. Here the same sequence against the script's globals: storage throws,
   * the reader is in the default view, and a SoCal team's league is stamped with its region.
   */
  it('a cross-region pin with storage throwing: the region comes from __sxRegionOf, not storage', () => {
    const { context, html } = run('throws');
    expect(Object.fromEntries(html.attrs)).toEqual({ 'data-js': '' });
    const regionOfLeague = context[REGION_OF] as (l: string) => string | null;
    const team = TEAMS.find((t) => t.slug === metroSlug)!;
    // What components/ui/use-league.ts setLeague does, in order: stamp the league, stamp its region.
    html.setAttribute('data-league', team.league);
    const region = regionOfLeague(team.league);
    expect(region).toBe('socal');
    if (region === 'socal') html.setAttribute('data-region', region);
    expect(Object.fromEntries(html.attrs)).toEqual({ 'data-js': '', 'data-league': 'metro', 'data-region': 'socal' });
    // A cross-tab restamp with storage still throwing clears both, as it does for the league alone:
    // nothing was saved, so the next page view is the default one.
    (context[PREFS_RESTAMP] as () => void)();
    expect(Object.fromEntries(html.attrs)).toEqual({ 'data-js': '' });
  });

  it('the cross-tab restamp follows a region written in another tab', () => {
    const stored: Record<string, string> = {};
    const html = new FakeHtml();
    const localStorage = { getItem: (k: string) => (k in stored ? stored[k] : null) };
    const context: Record<string, unknown> = { document: { documentElement: html }, localStorage };
    context.window = context;
    vm.runInNewContext(SCRIPT, context);
    expect(Object.fromEntries(html.attrs)).toEqual({ 'data-js': '' });
    stored[REGION_KEY] = 'socal';
    (context[PREFS_RESTAMP] as () => void)();
    expect(Object.fromEntries(html.attrs)).toEqual({ 'data-js': '', 'data-region': 'socal' });
    stored[REGION_KEY] = 'norcal';
    (context[PREFS_RESTAMP] as () => void)();
    expect(Object.fromEntries(html.attrs)).toEqual({ 'data-js': '' });
  });
});

/**
 * The row-marking pass (components/layout/pinned-team-script.ts) must stay registry-agnostic: a
 * hard-coded slug list there once made the script bail before marking any row for a pin on a team
 * outside one league. Validating the pin against the registry is the prefs script's job.
 */
describe('PINNED_TEAM_SCRIPT', () => {
  it('carries no slug list and stamps nothing on <html>', () => {
    for (const t of TEAMS) expect(PINNED_TEAM_SCRIPT).not.toContain(t.slug);
    expect(PINNED_TEAM_SCRIPT).not.toContain('data-has-pin');
    expect(PINNED_TEAM_SCRIPT).not.toContain('documentElement');
  });
});

describe('the region pick (data-region-picked)', () => {
  /**
   * A page at `/leaders<hash>` whose fragment target sits in a `data-region-scope` block of
   * `targetRegion`, with the click and hashchange listeners the script registers captured.
   */
  function page(hash: string, targetRegion: string) {
    const html = new FakeHtml();
    const on: Record<string, (e?: unknown) => void> = {};
    const replaced: string[] = [];
    const block = { dataset: { regionScope: targetRegion } };
    const context: Record<string, unknown> = {
      document: {
        documentElement: html,
        addEventListener: (type: string, fn: (e?: unknown) => void) => void (on[`document:${type}`] = fn),
        getElementById: (id: string) => (id !== '' && id === hash.slice(1) ? { closest: () => block } : null),
        querySelectorAll: () => [],
      },
      localStorage: { getItem: () => null },
      location: { pathname: '/leaders', search: '', hash },
      history: { state: { tree: 1 }, replaceState: (_s: unknown, _t: string, url: string) => void replaced.push(url) },
      addEventListener: (type: string, fn: () => void) => void (on[`window:${type}`] = fn),
    };
    context.window = context;
    vm.runInNewContext(SCRIPT, context);
    /** A tap on a region switcher button (or, with `option` null, on anything else). */
    const tap = (option: string | null, disabled = false) => {
      const button = { disabled, dataset: { regionOption: option } };
      on['document:click']!({ target: { closest: (sel: string) => (option !== null && sel === '[data-region-option]' ? button : null) } });
    };
    return { html, on, replaced, tap };
  }

  it('/leaders#elo-rating, then SoCal: marks the pick and drops the NorCal fragment', () => {
    const p = page('#elo-rating', 'norcal');
    expect(p.html.getAttribute(REGION_PICKED)).toBeNull();
    p.tap('socal');
    expect(p.html.getAttribute(REGION_PICKED)).toBe('');
    expect(p.replaced).toEqual(['/leaders']);
  });

  // popstate: load /playoffs#sunset, go to /about, tap NorCal, press Back. The traversal restores
  // the :target across App Router paths, and no hashchange fires for it.
  for (const event of ['hashchange', 'popstate']) {
    it(`the next fragment navigation is a new deep link: ${event} clears the pick`, () => {
      const p = page('#elo-rating', 'norcal');
      p.tap('socal');
      p.on[`window:${event}`]!();
      expect(p.html.getAttribute(REGION_PICKED)).toBeNull();
    });
  }

  it('a fragment in the chosen region, or none, stays as it is', () => {
    const inRegion = page('#elo-rating-socal', 'socal');
    inRegion.tap('socal');
    expect(inRegion.html.getAttribute(REGION_PICKED)).toBe('');
    expect(inRegion.replaced).toEqual([]);
    const none = page('', 'norcal');
    none.tap('socal');
    expect(none.html.getAttribute(REGION_PICKED)).toBe('');
    expect(none.replaced).toEqual([]);
  });

  it('ignores other clicks and a disabled (unhydrated) button', () => {
    const p = page('#elo-rating', 'norcal');
    p.tap(null);
    p.tap('socal', true);
    expect(p.html.getAttribute(REGION_PICKED)).toBeNull();
    expect(p.replaced).toEqual([]);
  });

});

describe('the client-side deep link (data-region-open)', () => {
  /**
   * A NorCal reader taps `<Link href="/leaders#players-socal">` on a team page. The router then
   * pushes the URL and renders /leaders, where `#players-socal` sits in `section[data-region-scope=
   * socal] > div[data-region-scope=socal]`, hidden (no client rects) unless `visible`. Frames and the
   * clock are driven by hand: `frame()` runs the pending animation-frame callbacks, `advance(ms)`.
   */
  function page() {
    const all: FakeElement[] = [];
    const scrolled: string[] = [];
    class FakeElement {
      attrs = new Map<string, string>();
      visible = false;
      constructor(
        public id: string,
        public parentElement: FakeElement | null,
        scope?: string,
      ) {
        if (scope) this.attrs.set('data-region-scope', scope);
      }
      hasAttribute(k: string) {
        return this.attrs.has(k);
      }
      setAttribute(k: string, v: string) {
        this.attrs.set(k, v);
      }
      removeAttribute(k: string) {
        this.attrs.delete(k);
      }
      getClientRects() {
        return this.visible ? [{}] : [];
      }
      get dataset() {
        return { regionScope: this.attrs.get('data-region-scope') };
      }
      /** Only the one selector the region pick asks for: `[data-region-scope]`. */
      closest(sel: string): FakeElement | null {
        if (sel === '[data-region-scope]' && this.hasAttribute('data-region-scope')) return this;
        return this.parentElement ? this.parentElement.closest(sel) : null;
      }
      scrollIntoView() {
        scrolled.push(this.id);
      }
    }
    const location = { pathname: '/teams/canyon-hills', search: '', hash: '' };
    let frames: (() => void)[] = [];
    let now = 0;
    const on: Record<string, (e?: unknown) => void> = {};
    const context: Record<string, unknown> = {
      document: {
        documentElement: new FakeHtml(),
        addEventListener: (type: string, fn: (e?: unknown) => void) => void (on[`document:${type}`] = fn),
        getElementById: (id: string) => all.find((e) => e.id === id) ?? null,
        // Only the one selector the script asks for: `[data-region-open]`.
        querySelectorAll: (sel: string) => all.filter((e) => sel === `[${REGION_OPEN}]` && e.hasAttribute(REGION_OPEN)),
      },
      localStorage: { getItem: () => null },
      location,
      history: { state: null, replaceState: () => {} },
      addEventListener: (type: string, fn: () => void) => void (on[`window:${type}`] = fn),
      requestAnimationFrame: (fn: () => void) => void frames.push(fn),
      Date: { now: () => now },
    };
    context.window = context;
    vm.runInNewContext(SCRIPT, context);
    const click = (target: unknown) => on['document:click']!({ target });
    return {
      scrolled,
      /** A tap on a link; `hash` is the anchor's `.hash`. */
      tapLink: (hash: string) => {
        const a = { hash };
        click({ closest: (sel: string) => (sel === 'a[href*="#"]' ? a : null) });
      },
      tapRegion: () => {
        const b = { disabled: false, dataset: { regionOption: 'norcal' } };
        click({ closest: (sel: string) => (sel === '[data-region-option]' ? b : null) });
      },
      /** The router commits /leaders#players-socal. */
      arrive: (visible = false) => {
        location.pathname = '/leaders';
        location.hash = '#players-socal';
        const section = new FakeElement('socal-section', null, 'socal');
        const inner = new FakeElement('', section, 'socal');
        const target = new FakeElement('players-socal', inner);
        target.visible = visible;
        all.push(section, inner, target, new FakeElement('norcal-section', null, 'norcal'));
      },
      frame: () => {
        const run = frames;
        frames = [];
        for (const fn of run) fn();
      },
      pending: () => frames.length,
      advance: (ms: number) => void (now += ms),
      open: () => all.filter((e) => e.hasAttribute(REGION_OPEN)).map((e) => e.id || '(inner)'),
      on,
    };
  }

  it('waits for the new page, then opens every region block around the hidden target and scrolls to it', () => {
    const p = page();
    p.tapLink('#players-socal');
    p.frame();
    p.frame();
    expect(p.open()).toEqual([]);
    expect(p.pending()).toBe(1);
    p.arrive();
    p.frame();
    expect(p.open()).toEqual(['socal-section', '(inner)']);
    expect(p.scrolled).toEqual(['players-socal']);
    expect(p.pending()).toBe(0);
  });

  it('a visible target (native :target, or the reader’s own region) is left alone', () => {
    const p = page();
    p.tapLink('#players-socal');
    p.arrive(true);
    p.frame();
    expect(p.open()).toEqual([]);
    expect(p.scrolled).toEqual([]);
  });

  it('gives up after 10 s, and a later tap stops the wait', () => {
    const slow = page();
    slow.tapLink('#players-socal');
    slow.advance(10_000);
    slow.frame();
    expect(slow.pending()).toBe(0);
    const p = page();
    p.tapLink('#players-socal');
    p.tapLink('');
    p.arrive();
    p.frame();
    expect(p.open()).toEqual([]);
  });

  it('a region pick, an in-page jump, Back and Forward clear every mark', () => {
    const p = page();
    p.tapLink('#players-socal');
    p.arrive();
    p.frame();
    p.tapRegion();
    expect(p.open()).toEqual([]);
    for (const event of ['hashchange', 'popstate']) {
      const q = page();
      q.tapLink('#players-socal');
      q.arrive();
      q.frame();
      expect(q.open()).toHaveLength(2);
      q.on[`window:${event}`]!();
      expect(q.open()).toEqual([]);
    }
  });
});
