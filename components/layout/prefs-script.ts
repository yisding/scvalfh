/**
 * The remembered league, pass one: stamp `<html>` BEFORE first paint (SPEC §8.2).
 *
 * A SEPARATE inline `<head>` script, beside the theme stamp and today's pinned-team marker script
 * (components/layout/pinned-team-script.ts, unchanged). It stamps four attributes on `<html>`:
 *
 * - `data-js`         — always, first: JS is running, so `.sx-js-only` controls (the team finder,
 *                       the scope chips) are shown from the first paint with their height reserved.
 * - `data-league`     — the EFFECTIVE league: the stored `scvalfh.league` when it is a known id;
 *                       none when it is `'all'`; else the pinned team's league; else none.
 * - `data-pin`        — the pinned slug, when it is a known slug.
 * - `data-pin-stale`  — when a pin is stored but is no longer a known slug, so the My-team slot can
 *                       say "That team is no longer in the data" instead of vanishing.
 *
 * The generated stylesheet (components/layout/league-scope-css.ts) keys off those attributes, so the
 * right home panel is the one painted first: CLS 0, no reordering, and with JS off or storage
 * blocked nothing is stamped and the first-visit view (with every link working) is what renders.
 *
 * This module has NO runtime import on purpose: the league ids and the 43-entry `{slug: league}`
 * map are arguments, so it is safe to import from a client module (components/ui/use-league.ts
 * reads `LEAGUE_KEY` and `PREFS_RESTAMP`) and from the root layout alike.
 *
 * The stamp function is also kept on `window[PREFS_RESTAMP]`, so a `storage` event from another tab
 * can re-run EXACTLY this validation (ids, slug map, stale pin) instead of a second copy of it.
 * React drops an inline <script> rendered inside <body>, so app/layout.tsx renders it in <head>
 * with `dangerouslySetInnerHTML`; `<html>` already carries `suppressHydrationWarning`.
 */

/** The storage key of the remembered league: a league id, or `'all'` ("show every league"). */
export const LEAGUE_KEY = 'scvalfh.league';

/** `'all'` = the reader chose "every league" explicitly; it removes `data-league`. */
export const ALL_LEAGUES = 'all';

/** Same key as components/layout/pinned-team-script.ts (kept literal: no runtime import here). */
const PIN_KEY = 'scvalfh.pinnedTeam';

/** The global the script leaves behind so a cross-tab `storage` event can re-stamp. */
export const PREFS_RESTAMP = '__sxPrefs';

const ID = /^[a-z0-9-]+$/;

export interface PrefsScriptInput {
  /** Every configured league id, config order. */
  leagueIds: readonly string[];
  /** `{ slug: leagueId }` for every registry team. */
  slugLeague: Readonly<Record<string, string>>;
}

/**
 * The inline script. Throws (at build time) on an id that is not `[a-z0-9-]+`, so nothing that
 * could close the string or the `<script>` can ever be interpolated.
 */
export function buildPrefsScript({ leagueIds, slugLeague }: PrefsScriptInput): string {
  for (const id of leagueIds) {
    if (!ID.test(id)) throw new Error(`prefs-script: bad league id ${JSON.stringify(id)}`);
  }
  // The map is shipped grouped by league, slugs space-joined, which is about half the bytes of a
  // flat {slug: league} object (43 entries) and keeps the whole script well under 2 KB.
  const grouped: Record<string, string[]> = {};
  for (const [slug, league] of Object.entries(slugLeague)) {
    if (!ID.test(slug) || !leagueIds.includes(league)) {
      throw new Error(`prefs-script: bad slug/league pair ${JSON.stringify([slug, league])}`);
    }
    (grouped[league] ??= []).push(slug);
  }
  const groups = JSON.stringify(Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.join(' ')])));
  const ids = JSON.stringify(leagueIds.join(' '));

  // ES5 on purpose: it runs before any bundle, on every browser that loads the page.
  return (
    `(function(){var d=document.documentElement,L=${ids}.split(' '),G=${groups},M={},k,s,i;` +
    `for(k in G){s=G[k].split(' ');for(i=s.length;i--;)M[s[i]]=k}` +
    `function f(){var l=null,p=null,h=Object.prototype.hasOwnProperty,e=null;` +
    `try{d.setAttribute('data-js','')}catch(x){}` +
    `try{l=localStorage.getItem('${LEAGUE_KEY}');p=localStorage.getItem('${PIN_KEY}')}catch(x){l=null;p=null}` +
    `try{var v=p&&h.call(M,p)?p:null;` +
    `if(v)d.setAttribute('data-pin',v);else d.removeAttribute('data-pin');` +
    `if(p&&!v)d.setAttribute('data-pin-stale','');else d.removeAttribute('data-pin-stale');` +
    `if(l&&L.indexOf(l)>=0)e=l;else if(l!=='${ALL_LEAGUES}'&&v)e=M[v];` +
    `if(e)d.setAttribute('data-league',e);else d.removeAttribute('data-league')}catch(x){}}` +
    `try{window.${PREFS_RESTAMP}=f}catch(x){}f()})();`
  );
}
