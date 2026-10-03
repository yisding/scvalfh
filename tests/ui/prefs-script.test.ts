/**
 * The pre-paint prefs stamp (components/layout/prefs-script.ts, SPEC §8.2), evaluated as the
 * browser would run it: the exact script string in a `node:vm` context with a fake `localStorage`,
 * `document.documentElement` and `window`.
 */
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { LEAGUE_KEY, PREFS_RESTAMP, buildPrefsScript } from '../../components/layout/prefs-script';
import { PINNED_TEAM_KEY, PINNED_TEAM_SCRIPT } from '../../components/layout/pinned-team-script';
import { TEAMS } from '../../lib/teams';
import { LEAGUE_IDS } from '../../lib/leagues';

const SLUG_LEAGUE = Object.fromEntries(TEAMS.map((t) => [t.slug, t.league]));
const SCRIPT = buildPrefsScript({ leagueIds: LEAGUE_IDS, slugLeague: SLUG_LEAGUE });

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

describe('buildPrefsScript', () => {
  it('stays within 2 KB including the 43-entry slug map', () => {
    expect(TEAMS.length).toBe(43);
    expect(Buffer.byteLength(SCRIPT, 'utf8')).toBeLessThanOrEqual(2048);
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
    expect(() => buildPrefsScript({ leagueIds: ["x'y"], slugLeague: {} })).toThrow();
    expect(() => buildPrefsScript({ leagueIds: ['scval'], slugLeague: { 'a</script>': 'scval' } })).toThrow();
    expect(() => buildPrefsScript({ leagueIds: ['scval'], slugLeague: { a: 'nope' } })).toThrow();
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
