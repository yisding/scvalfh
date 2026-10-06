/**
 * The scope stylesheet (components/layout/league-scope-css.ts, SPEC §8.2): one rule per league id
 * for each per-league family, the fixed rules verbatim, and nothing that could carry a league hue.
 */
import { describe, expect, it } from 'vitest';

import { buildLeagueScopeCss } from '../../components/layout/league-scope-css';
import { LEAGUE_IDS } from '../../lib/leagues';

const css = buildLeagueScopeCss(LEAGUE_IDS);
const rules = css.split('\n');

const count = (re: RegExp) => rules.filter((r) => re.test(r)).length;

describe('buildLeagueScopeCss', () => {
  it('covers the nine configured leagues', () => {
    expect(LEAGUE_IDS.length).toBe(9);
  });

  it('has the first-visit and none rules', () => {
    expect(rules).toContain(
      'html:not([data-league]) [data-scope]:not([data-scope="none"]):not([data-scope="all"]){display:none}',
    );
    expect(rules).toContain('html[data-league] [data-scope="none"]{display:none}');
  });

  for (const id of LEAGUE_IDS) {
    it(`has exactly one rule of each per-league family for ${id}`, () => {
      expect(
        rules.filter(
          (r) =>
            r ===
            `html[data-league="${id}"] [data-scope]:not([data-scope="${id}"]):not([data-scope="all"]):not([data-scope="none"]){display:none}`,
        ),
      ).toHaveLength(1);
      expect(rules.filter((r) => r === `html[data-league="${id}"] .sx-jump-${id}{display:inline-flex}`)).toHaveLength(1);
      expect(rules.filter((r) => r.startsWith(`html[data-league="${id}"] [data-league-option="${id}"]{`))).toHaveLength(1);
      expect(
        rules.filter((r) => r === `html[data-league="${id}"] [data-league-option="${id}"] .sx-chip-check{display:inline}`),
      ).toHaveLength(1);
    });
  }

  it('has one rule per league in each family and no more', () => {
    const n = LEAGUE_IDS.length;
    expect(count(/^html\[data-league="[a-z0-9-]+"\] \[data-scope\]:not/)).toBe(n);
    expect(count(/^html\[data-league="[a-z0-9-]+"\] \.sx-jump-/)).toBe(n);
    expect(count(/^html\[data-league="[a-z0-9-]+"\] \[data-league-option="[a-z0-9-]+"\]\{/)).toBe(n);
    // n leagues + the All chip + the two region options.
    expect(count(/\.sx-chip-check\{display:inline\}$/)).toBe(n + 3);
  });

  it('has the fixed rules: jump base, js-only, my-team slot, the All chip', () => {
    expect(rules).toContain('.sx-jump{display:none}');
    expect(rules).toContain('html:not([data-js]) .sx-js-only{display:none !important}');
    expect(rules).toContain('html:not([data-pin]):not([data-league]):not([data-pin-stale]) .sx-myteam-slot{display:none}');
    expect(rules.some((r) => r.startsWith('html:not([data-league]) [data-league-option="all"]{'))).toBe(true);
    expect(rules).toContain('html:not([data-league]) [data-league-option="all"] .sx-chip-check{display:inline}');
  });

  it('has the region rules verbatim (DESIGN-socal §2.4)', () => {
    // SoCal blocks hide only once JS has run: without it both regions render, NorCal first.
    expect(rules).toContain('html[data-js]:not([data-region="socal"]) [data-region-scope="socal"]{display:none}');
    expect(rules).toContain('html[data-region="socal"] [data-region-scope="norcal"]{display:none}');
    expect(rules.filter((r) => r.startsWith('html:not([data-region="socal"]) [data-region-option="norcal"]{'))).toHaveLength(1);
    expect(rules.filter((r) => r.startsWith('html[data-region="socal"] [data-region-option="socal"]{'))).toHaveLength(1);
    expect(rules).toContain('html:not([data-region="socal"]) [data-region-option="norcal"] .sx-chip-check{display:inline}');
    expect(rules).toContain('html[data-region="socal"] [data-region-option="socal"] .sx-chip-check{display:inline}');
    // A deep link opens its region: the block holding the target, and the block that is the target.
    expect(rules).toContain('[data-region-scope]:has(:target){display:block!important}');
    expect(rules).toContain('[data-region-scope]:target{display:block!important}');
    // The /teams lift, scoped to the /teams root so the home finder lifts nothing.
    expect(rules).toContain('[data-teams-page]:has(search[data-searching]) #team-list [data-region-scope]{display:block}');
    expect(css).not.toMatch(/(?:^|[\s,])\[data-searching\]/m);
  });

  it('puts the /teams lift after both region hide rules (it wins on specificity and order)', () => {
    const lift = rules.indexOf('[data-teams-page]:has(search[data-searching]) #team-list [data-region-scope]{display:block}');
    const hides = rules.flatMap((r, i) => (r.includes('[data-region-scope="') && r.endsWith('{display:none}') ? [i] : []));
    expect(hides).toHaveLength(2);
    for (const i of hides) expect(lift).toBeGreaterThan(i);
  });

  it('draws the selected chip with the accent wash, accent ink, 600 and a 1.5px ink ring — no league hue', () => {
    const selected = rules.filter(
      (r) => (r.includes('[data-league-option=') || r.includes('[data-region-option=')) && !r.includes('.sx-chip-check'),
    );
    expect(selected).toHaveLength(LEAGUE_IDS.length + 1 + 2);
    for (const r of selected) {
      expect(r).toContain('background:var(--sx-accent-wash)');
      expect(r).toContain('color:var(--sx-accent-ink)');
      expect(r).toContain('font-weight:600');
      expect(r).toContain('1.5px var(--sx-text)');
    }
    // Only the shared tokens: no literal colour anywhere.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i);
  });

  it('rejects an id that could break out of a selector', () => {
    expect(() => buildLeagueScopeCss(['bad"id'])).toThrow();
    expect(() => buildLeagueScopeCss(['all'])).toThrow();
  });
});
