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
  // rounded up to 256 B: 2,748 → 2,816 B. The Southern Section independents (DESIGN §24.9: three
  // slugs and one more league id, in L, G and R) took it to 2,537 B the same day; by the same rule
  // 2,537 × 1.12 = 2,842 → 3,072 B, 83 % used.
  it('stays within 3,072 B including the 102-entry slug map', () => {
    expect(TEAMS.length).toBe(102);
    expect(Buffer.byteLength(SCRIPT, 'utf8')).toBeLessThanOrEqual(3072);
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
