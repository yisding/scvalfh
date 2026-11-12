/**
 * The remembered league, the CSS half (SPEC §8.2). `app/layout.tsx` renders this as an UNLAYERED
 * inline `<style>` in `<head>`: Tailwind cannot generate a selector per (league id × attribute)
 * pair, and an unlayered rule outranks every `@layer`, utilities included, so the pre-paint state
 * always wins over a component's own classes.
 *
 * Everything keys off the attributes the prefs script stamps on `<html>` before first paint
 * (components/prefs/prefs-script.ts):
 *
 * - `[data-scope="<id>"]`  shown only when that league is the effective league;
 *   `[data-scope="none"]`  shown only when there is none (the first-visit view);
 *   `[data-scope="all"]`   always shown.
 * - `.sx-js-only`          hidden without JS (nothing stamped `data-js`).
 * - `[data-league-option="<id>"]`  the scope tabs: the effective league's tab (or `all` when
 *                          there is none) is drawn selected before hydration. Never colour alone:
 *                          weight 700 and a 3px ink bar.
 *
 * The region half (DESIGN-socal §2.4), keyed off `data-region` (stamped `"socal"` only; absent =
 * NorCal):
 *
 * - `[data-region-scope="socal"]`  hidden unless the region is SoCal — but only once JS has run
 *                          (`html[data-js]`): with JS off both regions render, NorCal first, so the
 *                          DOM order is the reading order and every link works (CLS 0).
 * - `[data-region-scope="norcal"]` hidden when the region is SoCal (only JS can stamp that).
 * - `[data-region-option="<region>"]` the region switcher's two buttons: the effective region's is
 *                          drawn selected (the same weight and bar as a league tab)
 *                          before hydration.
 * - a deep link opens its region: a region block that IS the `:target` (`/standings#socal`) or holds
 *                          it (`/leaders#elo-rating-socal`) is shown whatever the stamp says.
 *                          `display:block`, so it is meant for block wrappers: a region-scoped flex or
 *                          grid list must not hold an anchor target (wrap it in a div that does).
 *                          Off while `html[data-region-picked]` (prefs-script.ts REGION_PICKED): once
 *                          the reader picks a region, the stamp alone decides, until the next jump.
 *                          A client-side navigation never sets `:target`, so for it the prefs script
 *                          marks the target's blocks `data-region-open` (REGION_OPEN) instead.
 * - the /teams lift: while the finder on /teams is searching (`search[data-searching]`, a sibling of
 *                          `#team-list`, components/search/TeamFinder.tsx), both regions' team lists
 *                          show, so a match the live region announces is never a hidden tile
 *                          (design-review UI §6). Scoped to `[data-teams-page]` so the home finder,
 *                          which also sets `data-searching`, lifts nothing. Placed after the hide rules
 *                          and more specific than both (an id), so it needs no `!important`.
 *
 * No league hue anywhere (DESIGN §6.4): every selected state is the one ink weight plus bar.
 * `display: none` also removes a hidden panel from the accessibility tree; DOM order stays the
 * visual order (WCAG 1.3.2 / 2.4.3).
 */

import { REGION_OPEN, REGION_PICKED } from './prefs-script';

const ID = /^[a-z0-9-]+$/;

/**
 * The two regions, spelled out: this module is imported by the root layout only, but it mirrors the
 * prefs script, which stamps `data-region="socal"` and nothing for NorCal (STAMPLESS_REGION).
 */
const SOCAL = 'socal';
const NORCAL = 'norcal';

/**
 * The selected league tab: ink, weight 700 and a 3px accent bar — the same look globals.css gives
 * `:is(.sx-tab, .sx-league-chip, .sx-opt):is([aria-pressed="true"], …)`, so the pre-paint state and
 * the hydrated one match. Change the two together (and tests/ui/scope-css.test.ts).
 */
const SELECTED = 'color:var(--sx-text);font-weight:700;box-shadow:inset 0 -3px 0 var(--sx-accent)';
/**
 * The selected segment of the region switch: globals.css' `.sx-seg > .sx-opt[aria-pressed="true"]`.
 * Scoped to `.sx-seg`, so the text face ("Switch to SoCal", whose `data-region-option` is the OTHER
 * region) is never drawn as selected.
 */
const SEG_SELECTED = 'background:var(--sx-surface-3);color:var(--sx-text)';

export function buildLeagueScopeCss(leagueIds: readonly string[]): string {
  for (const id of leagueIds) {
    if (!ID.test(id) || id === 'all' || id === 'none') {
      throw new Error(`league-scope-css: bad league id ${JSON.stringify(id)}`);
    }
  }
  const rules: string[] = [
    'html:not([data-league]) [data-scope]:not([data-scope="none"]):not([data-scope="all"]){display:none}',
    'html[data-league] [data-scope="none"]{display:none}',
  ];
  for (const id of leagueIds) {
    rules.push(
      `html[data-league="${id}"] [data-scope]:not([data-scope="${id}"]):not([data-scope="all"]):not([data-scope="none"]){display:none}`,
    );
  }
  rules.push('html:not([data-js]) .sx-js-only{display:none !important}');
  for (const id of leagueIds) {
    rules.push(`html[data-league="${id}"] [data-league-option="${id}"]{${SELECTED}}`);
  }
  rules.push(`html:not([data-league]) [data-league-option="all"]{${SELECTED}}`);
  // The region half (DESIGN-socal §2.4), verbatim from the design.
  rules.push(`html[data-js]:not([data-region="${SOCAL}"]) [data-region-scope="${SOCAL}"]{display:none}`);
  rules.push(`html[data-region="${SOCAL}"] [data-region-scope="${NORCAL}"]{display:none}`);
  rules.push(`html:not([data-region="${SOCAL}"]) .sx-seg>[data-region-option="${NORCAL}"]{${SEG_SELECTED}}`);
  rules.push(`html[data-region="${SOCAL}"] .sx-seg>[data-region-option="${SOCAL}"]{${SEG_SELECTED}}`);
  // Both deep-link rules stand down once the reader picks a region on this page view
  // (REGION_PICKED): tap `#elo-rating` on /leaders, then SoCal, and the NorCal block that holds the
  // `:target` would otherwise stay open above SoCal's, since dropping the fragment with
  // `history.replaceState` does not clear `:target`.
  rules.push(`html:not([${REGION_PICKED}]) [data-region-scope]:has(:target){display:block!important}`);
  // Not in the design's list: `:has()` never matches the element itself, so a link to the region
  // wrapper's own id (`/standings#socal`, the jump links) needs its own rule to open that region.
  rules.push(`html:not([${REGION_PICKED}]) [data-region-scope]:target{display:block!important}`);
  // The same for a client-side navigation to a fragment, which never sets `:target`: the prefs
  // script marks the hidden target's region blocks REGION_OPEN once the new page is in. No pick
  // gate: the script clears the marks on a pick itself.
  rules.push(`[data-region-scope][${REGION_OPEN}]{display:block!important}`);
  rules.push('[data-teams-page]:has(search[data-searching]) #team-list [data-region-scope]{display:block}');
  return rules.join('\n');
}
