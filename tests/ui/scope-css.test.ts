/**
 * The scope stylesheet (components/prefs/league-scope-css.ts, SPEC §8.2): one rule per league id
 * for each per-league family, the fixed rules verbatim, and nothing that could carry a league hue.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildLeagueScopeCss } from '../../components/prefs/league-scope-css';
import { LEAGUE_IDS } from '../../lib/leagues';

import { REPO } from '../helpers';

const css = buildLeagueScopeCss(LEAGUE_IDS);
const rules = css.split('\n');

const count = (re: RegExp) => rules.filter((r) => re.test(r)).length;

/**
 * The selected league tab before hydration: ink, weight 700 and a 3px accent bar. EXACT: no
 * `background`, no `border` (DESIGN §33: selection is bold plus a bar, never a fill). globals.css
 * draws the hydrated state with the same three declarations.
 */
const SELECTED = 'color:var(--sx-text);font-weight:700;box-shadow:inset 0 -3px 0 var(--sx-accent)';
/**
 * The selected SEGMENT of the region switch, the one control that is a switch: plane 3 and ink,
 * as globals.css' `.sx-seg > .sx-opt[aria-pressed="true"]`. Scoped to `.sx-seg`, so the text face
 * ("Switch to SoCal", whose `data-region-option` is the OTHER region) is never drawn selected.
 */
const SEG_SELECTED = 'background:var(--sx-surface-3);color:var(--sx-text)';

describe('buildLeagueScopeCss', () => {
  it('covers the nine configured leagues and the independents', () => {
    expect(LEAGUE_IDS.length).toBe(10);
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
      expect(rules.filter((r) => r.startsWith(`html[data-league="${id}"] [data-league-option="${id}"]{`))).toHaveLength(1);
      expect(rules.filter((r) => r === `html[data-league="${id}"] [data-league-option="${id}"]{${SELECTED}}`)).toHaveLength(1);
    });
  }

  it('has one rule per league in each family and no more', () => {
    const n = LEAGUE_IDS.length;
    expect(count(/^html\[data-league="[a-z0-9-]+"\] \[data-scope\]:not/)).toBe(n);
    expect(count(/^html\[data-league="[a-z0-9-]+"\] \[data-league-option="[a-z0-9-]+"\]\{/)).toBe(n);
    // There are no check spans any more: the selected state is the tab itself.
    expect(css).not.toContain('sx-chip-check');
    expect(css).not.toContain('sx-check');
    expect(css).not.toContain('visibility');
  });

  it('has the fixed rules: js-only and the All chip; the retired jump links and My-team slot have none', () => {
    expect(rules).toContain('html:not([data-js]) .sx-js-only{display:none !important}');
    // LeagueJumpLinks and the home My-team slot are deleted (UI refresh, spec 5.8 and 6): no rule may linger.
    expect(css).not.toContain('sx-jump');
    expect(css).not.toContain('sx-myteam');
    expect(rules).toContain(`html:not([data-league]) [data-league-option="all"]{${SELECTED}}`);
  });

  it('has the region rules verbatim (DESIGN-socal §2.4)', () => {
    // SoCal blocks hide only once JS has run: without it both regions render, NorCal first.
    expect(rules).toContain('html[data-js]:not([data-region="socal"]) [data-region-scope="socal"]{display:none}');
    expect(rules).toContain('html[data-region="socal"] [data-region-scope="norcal"]{display:none}');
    // The two segments of the switch, and ONLY inside `.sx-seg`: the footer and More-sheet text
    // buttons carry `data-region-option` too and must never be drawn as selected.
    expect(rules).toContain(`html:not([data-region="socal"]) .sx-seg>[data-region-option="norcal"]{${SEG_SELECTED}}`);
    expect(rules).toContain(`html[data-region="socal"] .sx-seg>[data-region-option="socal"]{${SEG_SELECTED}}`);
    const regionOption = rules.filter((r) => r.includes('[data-region-option='));
    expect(regionOption).toHaveLength(2);
    for (const r of regionOption) expect(r).toContain('.sx-seg>[data-region-option=');
    // A deep link opens its region: the block holding the target, and the block that is the target,
    // until the reader picks a region on that page view (/leaders#elo-rating, then SoCal).
    expect(rules).toContain('html:not([data-region-picked]) [data-region-scope]:has(:target){display:block!important}');
    expect(rules).toContain('html:not([data-region-picked]) [data-region-scope]:target{display:block!important}');
    expect(rules.filter((r) => r.includes(':target'))).toHaveLength(2);
    // A client-side navigation never sets :target: the prefs script marks the blocks instead.
    expect(rules).toContain('[data-region-scope][data-region-open]{display:block!important}');
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

  it('draws the selected tab as ink, 700 and a 3px accent bar: no fill, no border, no league hue', () => {
    const selected = rules.filter((r) => r.includes('[data-league-option='));
    expect(selected).toHaveLength(LEAGUE_IDS.length + 1);
    for (const r of selected) {
      const body = r.slice(r.indexOf('{') + 1, -1);
      expect(body).toBe(SELECTED);
      expect(body).not.toContain('background');
      expect(body).not.toContain('border');
    }
    // The region segment is the one filled selection, on plane 3 (chrome only), with no bar.
    for (const r of rules.filter((r) => r.includes('[data-region-option='))) {
      const body = r.slice(r.indexOf('{') + 1, -1);
      expect(body).toBe(SEG_SELECTED);
      expect(body).not.toContain('box-shadow');
    }
    // Only the shared tokens: no literal colour anywhere.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i);
  });

  it('matches the hydrated look globals.css draws, declaration for declaration', () => {
    const globals = readFileSync(path.join(REPO, 'app', 'globals.css'), 'utf8');
    expect(globals).toContain(
      ':is(.sx-tab, .sx-league-chip, .sx-opt):is([aria-pressed="true"], [aria-current], [aria-selected="true"]) { color: var(--sx-text); font-weight: 700; box-shadow: inset 0 -3px 0 var(--sx-accent); }',
    );
    expect(globals).toMatch(
      /\.sx-seg > \.sx-opt\[aria-pressed="true"\] \{ background: var\(--sx-surface-3\); color: var\(--sx-text\);/,
    );
  });

  it('rejects an id that could break out of a selector', () => {
    expect(() => buildLeagueScopeCss(['bad"id'])).toThrow();
    expect(() => buildLeagueScopeCss(['all'])).toThrow();
  });
});
