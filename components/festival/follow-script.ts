/**
 * Following festival teams (/festival, DESIGN §35): the storage key, the `<html>` stamp and the pre-paint
 * script, in an import-free leaf.
 *
 * The key lives HERE and not in the client hook for the reason components/prefs/pinned-team-script.ts gives:
 * a server module that imports a constant from a `'use client'` module gets a client reference, and
 * interpolating that into a script string once shipped an error message as a storage key.
 *
 * The followed teams are a space-separated list of festival team slugs in `localStorage` (this browser only;
 * nothing leaves it). The head script copies the list onto `<html data-fest-follow="slug slug">`
 * synchronously, before first paint, and the festival layout's generated stylesheet
 * (components/festival/follow-css.ts) keys every mark off that one attribute: a followed team's star and
 * bold name, its "Your teams" card. `<html>` survives client-side navigations, so unlike the pinned team
 * there is no second pass after a route change. The script is ES5 inside a try/catch, like the theme stamp:
 * with storage blocked the page is simply unmarked.
 *
 * A value is checked where it is read: each slug against SLUG, duplicates dropped, at most FEST_FOLLOW_MAX
 * kept. The known-slug check (a team renamed or withdrawn mid-event) is the client's
 * (FestivalFollowSync), which has the festival's slugs; the head script runs on every page of the site and
 * carries none of them.
 */

/** The storage key. Not versioned, like the site's other keys (components/prefs/local-store.ts). */
export const FEST_FOLLOW_KEY = 'scvalfh.festivalTeams';

/** The `<html>` attribute the script and the hook stamp, and the stylesheet keys off. */
export const FEST_FOLLOW_ATTR = 'data-fest-follow';

/** How many teams one browser follows at most: a family's teams and their friends', with room to spare. */
export const FEST_FOLLOW_MAX = 40;

/** The global the script leaves behind, so a same-tab write can restamp `<html>` with the script's own code. */
export const FEST_FOLLOW_RESTAMP = '__sxFest';

/** A festival team slug (lib/festival/festival-schema.ts slugId). */
const SLUG = /^[a-z0-9-]+$/;

/**
 * A stored value → the followed slugs, in stored order: well-formed, unique, at most FEST_FOLLOW_MAX.
 * The script below is the same rule in ES5; tests/ui/festival-follow.test.ts runs both on the same inputs.
 */
export function parseFollows(value: string | null | undefined): string[] {
  const out: string[] = [];
  if (!value) return out;
  for (const slug of value.split(' ')) {
    if (out.length >= FEST_FOLLOW_MAX) break;
    if (SLUG.test(slug) && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/**
 * The head script (app/layout.tsx, after the pinned-team script). It stamps on load, leaves
 * `window.__sxFest` for the hook's same-tab writes, and restamps on another tab's `storage` event. No `<`
 * anywhere in it (comparisons are written `>`), so nothing in it can ever read as a closing tag.
 */
export const FEST_FOLLOW_SCRIPT =
  `(function(){function s(){try{var h=document.documentElement,v=localStorage.getItem('${FEST_FOLLOW_KEY}'),` +
  `a=v?v.split(' '):[],o=[];for(var i=0;a.length>i&&${FEST_FOLLOW_MAX}>o.length;i++)` +
  `if(/^[a-z0-9-]+$/.test(a[i])&&o.indexOf(a[i])==-1)o.push(a[i]);` +
  `if(o.length)h.setAttribute('${FEST_FOLLOW_ATTR}',o.join(' '));else h.removeAttribute('${FEST_FOLLOW_ATTR}')}catch(e){}}` +
  `s();try{window.${FEST_FOLLOW_RESTAMP}=s;window.addEventListener('storage',function(e){` +
  `if(e.key===null||e.key==='${FEST_FOLLOW_KEY}')s()})}catch(e){}})();`;

/** The `<html>` attribute stamped once the home page's festival notice is past its window (FestivalNotice.tsx). */
export const FEST_OVER_ATTR = 'data-fest-over';

/**
 * The head script as the root layout ships it: FEST_FOLLOW_SCRIPT, then one statement that stamps
 * `<html data-fest-over>` when the reader's clock is at or past `closesMs`, the instant the home page's festival
 * notice comes down (festivalNoticeCloses, embedded at build time). The notice is static and field hockey's last
 * scheduled build of the season is the festival's own last day, so without this it would stay up until the next code
 * push; app/globals.css hides `[data-festival-notice]` under the stamp. A whole number, so nothing but digits is
 * interpolated; `>=` and no `<`, like the rest.
 */
export function festivalHeadScript(closesMs: number): string {
  if (!Number.isSafeInteger(closesMs)) throw new Error(`follow-script: ${closesMs} is not an instant in ms`);
  return `${FEST_FOLLOW_SCRIPT}try{Date.now()>=${closesMs}&&document.documentElement.setAttribute('${FEST_OVER_ATTR}','')}catch(e){}`;
}
