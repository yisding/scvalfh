/**
 * The remembered league and region, pass one: stamp `<html>` BEFORE first paint (SPEC §8.2;
 * DESIGN-socal §2.4).
 *
 * A SEPARATE inline `<head>` script, beside the theme stamp and today's pinned-team marker script
 * (components/head/pinned-team-script.ts, unchanged). It stamps five attributes on `<html>`:
 *
 * - `data-js`         — always, first: JS is running, so `.sx-js-only` controls (the team finder,
 *                       the scope chips, the region switcher) are shown from the first paint with
 *                       their height reserved.
 * - `data-league`     — the EFFECTIVE league: the stored `scvalfh.league` when it is a known id;
 *                       none when it is `'all'`; else the pinned team's league (only when it is in
 *                       the stored region, if one is stored); else none.
 * - `data-region`     — the EFFECTIVE region, stamped ONLY when it is not the default: `"socal"`.
 *                       Absent means NorCal, so a JS-free render, a blocked storage and a first
 *                       visit all read as NorCal and nothing NorCal-only ever has to be stamped.
 * - `data-pin`        — the pinned slug, when it is a known slug.
 * - `data-pin-stale`  — when a pin is stored but is no longer a known slug, so the My-team slot can
 *                       say "That team is no longer in the data" instead of vanishing.
 *
 * The region's precedence (DESIGN-socal §2.4, design-review UI §5): a valid stored league wins and
 * the region is ITS region (so a stored `city` with a stored `norcal` still stamps SoCal: the league
 * is the more specific act); else a valid stored region `scvalfh.region`, with the pin's league as
 * the effective league only when the pin is in that region; else a valid pin (region and league
 * both from the pinned team); else the default region and no league. A stored region is written
 * only by an explicit act: the region switcher, `setLeague` (which writes the league's region) and
 * pinning (through `setLeague`). Links never write it.
 *
 * The script also leaves `window.__sxRegionOf(leagueId)` behind: the ONE copy of the league→region
 * map the client needs. `setLeague` (components/hooks/use-league.ts) calls it to stamp `data-region` in
 * the same tick as `data-league`, so pinning a team of the other region never leaves the page with a
 * league panel inside a hidden region; and no client bundle carries the map or imports lib/config/leagues
 * (tests/arch/client-boundary.test.ts). The map ships as `R={"socal":"sunset city north-county
 * metro"}`: only the non-default regions, their leagues space-joined.
 *
 * The generated stylesheet (components/head/league-scope-css.ts) keys off those attributes, so the
 * right home panel is the one painted first: CLS 0, no reordering, and with JS off or storage
 * blocked nothing is stamped and the first-visit view (with every link working) is what renders.
 *
 * This module imports only the import-free pinned-team-script leaf, on purpose: the league ids, the
 * league→region map and the 102-entry `{slug: league}` map are arguments, so it is safe to import
 * from a client module (components/hooks/use-league.ts reads `LEAGUE_KEY`, `REGION_KEY`,
 * `PREFS_RESTAMP` and `REGION_OF`) and from the root layout alike.
 *
 * The region pick (`data-region-picked`, REGION_PICKED). A jump link leaves a `:target` in the URL
 * (`/leaders#elo-rating`), and the scope stylesheet's deep-link rule holds the block around it open
 * whatever the region stamp says; `history.replaceState` does not clear `:target`. So the script
 * listens for a tap on a region switcher button (`[data-region-option]`, once it is enabled, i.e.
 * hydrated) and stamps `data-region-picked`, which turns the rule off for this page view: tap
 * `#elo-rating`, then SoCal, and the NorCal boards close like the rest of NorCal. A fragment whose
 * target sits in a block of the other region is also dropped from the URL, so a reload or a shared
 * link opens the region the reader chose. The next fragment navigation (a jump link, back, forward)
 * is a new deep link and removes the attribute (`hashchange`, and `popstate` for Back or Forward
 * across paths, which restores a `:target` without a hashchange). It lives here, not in the switcher's client module,
 * because /teams has no first-load JS to spare (scripts/ci/assert-budgets.ts) and every page already
 * runs this script.
 *
 * The stamp function is also kept on `window[PREFS_RESTAMP]`, so a `storage` event from another tab
 * can re-run EXACTLY this validation (ids, slug map, stale pin, region precedence) instead of a
 * second copy of it. React drops an inline <script> rendered inside <body>, so app/layout.tsx renders
 * it in <head> with `dangerouslySetInnerHTML`; `<html>` already carries `suppressHydrationWarning`.
 */

import { PINNED_TEAM_KEY } from './pinned-team-script';

/** The storage key of the remembered league: a league id, or `'all'` ("show every league"). */
export const LEAGUE_KEY = 'scvalfh.league';

/** `'all'` = the reader chose "every league" explicitly; it removes `data-league`. */
export const ALL_LEAGUES = 'all';

/** The global the script leaves behind so a cross-tab `storage` event can re-stamp. */
export const PREFS_RESTAMP = '__sxPrefs';

/**
 * The storage key of the remembered region: a region id (`'norcal'` | `'socal'`). Written only by
 * the region switcher, `setLeague` and pinning (DESIGN-socal §2.4); never by a link.
 */
export const REGION_KEY = 'scvalfh.region';

/**
 * The region an absent `data-region` means: NorCal, the first-visit view and the JS-free reading
 * order (lib/config/leagues.ts DEFAULT_REGION, which this client-safe module cannot import; the root layout
 * passes that constant as `defaultRegion` and the script throws at build time if they differ).
 */
export const STAMPLESS_REGION = 'norcal';

/** The global `(leagueId) => regionId | null` the script leaves behind for `setLeague`. */
export const REGION_OF = '__sxRegionOf';

/**
 * `<html data-region-picked>`: the reader tapped a region switcher button on THIS page view. Never
 * stored; set by the script's click listener and cleared by its `hashchange` and `popstate`
 * listeners (see the header). While it is set the scope stylesheet's deep-link rule is off
 * (components/head/league-scope-css.ts).
 */
export const REGION_PICKED = 'data-region-picked';

const ID = /^[a-z0-9-]+$/;

export interface PrefsScriptInput {
  /** Every configured league id, config order. */
  leagueIds: readonly string[];
  /** `{ slug: leagueId }` for every registry team. */
  slugLeague: Readonly<Record<string, string>>;
  /** `{ leagueId: regionId }` for every configured league (lib/config/leagues.ts regionOf). */
  leagueRegion: Readonly<Record<string, string>>;
  /** The region an absent `data-region` means: must be STAMPLESS_REGION. */
  defaultRegion: string;
}

/**
 * The inline script. Throws (at build time) on an id that is not `[a-z0-9-]+`, so nothing that
 * could close the string or the `<script>` can ever be interpolated.
 */
export function buildPrefsScript({ leagueIds, slugLeague, leagueRegion, defaultRegion }: PrefsScriptInput): string {
  for (const id of leagueIds) {
    if (!ID.test(id)) throw new Error(`prefs-script: bad league id ${JSON.stringify(id)}`);
  }
  if (defaultRegion !== STAMPLESS_REGION) {
    throw new Error(`prefs-script: the default region must be ${STAMPLESS_REGION}, got ${JSON.stringify(defaultRegion)}`);
  }
  // The map is shipped grouped by league, slugs space-joined, which is about half the bytes of a
  // flat {slug: league} object (102 entries) and keeps the whole script within its 3 KB line
  // (2,454 B measured 2026-10-06; tests/ui/prefs-script.test.ts).
  const grouped: Record<string, string[]> = {};
  for (const [slug, league] of Object.entries(slugLeague)) {
    if (!ID.test(slug) || !leagueIds.includes(league)) {
      throw new Error(`prefs-script: bad slug/league pair ${JSON.stringify([slug, league])}`);
    }
    (grouped[league] ??= []).push(slug);
  }
  // Only the non-default regions ship, each with its leagues space-joined: R={"socal":"sunset …"}.
  const regions: Record<string, string[]> = {};
  for (const id of leagueIds) {
    const region = leagueRegion[id];
    if (region === undefined || !ID.test(region)) {
      throw new Error(`prefs-script: league ${JSON.stringify(id)} has no valid region`);
    }
    if (region !== defaultRegion) (regions[region] ??= []).push(id);
  }
  const groups = JSON.stringify(Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.join(' ')])));
  const regionGroups = JSON.stringify(Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, v.join(' ')])));
  const ids = JSON.stringify(leagueIds.join(' '));
  const D = JSON.stringify(defaultRegion);

  // ES5 on purpose: it runs before any bundle, on every browser that loads the page.
  // M: slug → league; Q: league → non-default region; Y(l): a known league's region (D otherwise).
  // In f(): l the stored league, p the stored pin, r the stored region, v the valid pin, e the
  // effective league, g the effective region; the four branches are the precedence above.
  return (
    `(function(){var d=document.documentElement,L=${ids}.split(' '),G=${groups},R=${regionGroups},D=${D},` +
    `h=Object.prototype.hasOwnProperty,M={},Q={},k,s,i;` +
    `for(k in G){s=G[k].split(' ');for(i=s.length;i--;)M[s[i]]=k}` +
    `for(k in R){s=R[k].split(' ');for(i=s.length;i--;)Q[s[i]]=k}` +
    `function Y(l){return h.call(Q,l)?Q[l]:D}` +
    `function f(){var l=null,p=null,r=null,e=null,g=D;` +
    `try{d.setAttribute('data-js','')}catch(x){}` +
    `try{l=localStorage.getItem('${LEAGUE_KEY}');p=localStorage.getItem('${PINNED_TEAM_KEY}');` +
    `r=localStorage.getItem('${REGION_KEY}')}catch(x){l=null;p=null;r=null}` +
    `try{var v=p&&h.call(M,p)?p:null,a=l==='${ALL_LEAGUES}';` +
    `if(v)d.setAttribute('data-pin',v);else d.removeAttribute('data-pin');` +
    `if(p&&!v)d.setAttribute('data-pin-stale','');else d.removeAttribute('data-pin-stale');` +
    `if(l&&L.indexOf(l)>=0){e=l;g=Y(l)}` +
    `else if(r===D||h.call(R,r)){g=r;if(!a&&v&&Y(M[v])===r)e=M[v]}` +
    `else if(v){g=Y(M[v]);if(!a)e=M[v]}` +
    `if(e)d.setAttribute('data-league',e);else d.removeAttribute('data-league');` +
    `if(g!==D)d.setAttribute('data-region',g);else d.removeAttribute('data-region')}catch(x){}}` +
    `try{window.${PREFS_RESTAMP}=f;window.${REGION_OF}=function(l){return L.indexOf(l)>=0?Y(l):null}}catch(x){}f();` +
    // The region pick (REGION_PICKED): b the tapped switcher button, k the fragment's target and then
    // the region block holding it. Every fragment target on the site is a plain [a-z0-9-] id, so the
    // hash is not decoded (decodeURIComponent throws on a stray %).
    `try{var P='${REGION_PICKED}';document.addEventListener('click',function(e){var b=e.target,k;` +
    `b=b&&b.closest&&b.closest('[data-region-option]');if(!b||b.disabled)return;d.setAttribute(P,'');` +
    `k=document.getElementById(location.hash.slice(1));k=k&&k.closest('[data-region-scope]');` +
    `if(k&&k.dataset.regionScope!==b.dataset.regionOption)` +
    `history.replaceState(history.state,'',location.pathname+location.search)});` +
    // Back or Forward across App Router paths restores a `:target` with no hashchange (that fires
    // only when the URLs differ by the fragment alone), so popstate clears the pick too.
    `function c(){d.removeAttribute(P)}addEventListener('hashchange',c);addEventListener('popstate',c)}catch(x){}})();`
  );
}
