import type { TeamSlug } from '../../lib/types';

/**
 * The pinned-team highlight, pass one: mark the pinned rows BEFORE first paint (DESIGN §3.2
 * "▓ = pinned", §3.6).
 *
 * The pin lives in `localStorage` and nothing about it leaves the browser, so the server cannot
 * know it — but /standings, /teams and the home page's mini tables are fully static pages whose
 * only need is to mark ONE row. A ~690-byte inline script reads the slug and sets `data-pinned` on
 * every element carrying the matching `data-team-slug`. It costs no React, no hydration and no
 * layout: the rule it switches on is an inset box-shadow, so CLS stays 0.
 *
 * It sits in <head> beside the theme stamp and waits for `DOMContentLoaded`, because React drops an
 * inline <script> rendered inside <body> (verified in the built HTML).
 *
 * `DOMContentLoaded` fires ONCE PER DOCUMENT, so this pass covers hard loads only — on a client-
 * side navigation (the bottom tab bar, which is the primary phone path) React renders the new page
 * from the RSC payload and nothing here runs again, which left the pinned row unmarked on exactly
 * the journeys a phone takes. `components/ui/PinnedTeamMarks.tsx` is pass two: it re-applies the
 * same attribute after every navigation and whenever the pin itself changes. This script stays
 * because it is the only pass that can run before the first paint.
 *
 * An ATTRIBUTE, not a class, on purpose: `StandingsTable`'s `highlightSlug` prop marks a row with
 * the `.sx-pinned` class from the server, and the two channels have to be able to coexist without
 * one clearing the other. app/globals.css styles both identically.
 *
 * The same rule reveals a visually hidden "your team" note (`.sx-pin-note`), so the marker is never
 * carried by colour alone (DESIGN §6.5).
 *
 * It also stamps `data-has-pin` on <html>, IMMEDIATELY rather than at `DOMContentLoaded`, because
 * that one is read by layout: the home page's "My team" card (components/home/MyTeamCard.tsx) has
 * a height FLOOR only while a team is pinned, so the server-rendered picker can be short for the
 * reader with no pin and still stand at the pinned card's height, from the first paint, for the
 * reader with one. Only for a slug that names one of the fifteen schools: a STALE pin (a school
 * no longer in the data) is cleared after hydration and never shows a card, so a floor held open
 * for it collapsed under the reader — a 0.14 layout shift — the moment it was cleared.
 * `PinnedTeamMarks` keeps the attribute in step after hydration.
 *
 * Reading storage can throw in a private window or with site data blocked, so the read is in a
 * try/catch and the page is simply unmarked when it does — exactly like the theme stamp.
 */
/**
 * The storage key lives HERE rather than in the `'use client'` hook that also uses it: importing
 * it from a client module on the server yields a client REFERENCE, and interpolating that into
 * this string shipped a "you called a client function from the server" error message into the
 * page as the localStorage key. (It did exactly that until the built HTML was read.)
 */
export const PINNED_TEAM_KEY = 'scvalfh.pinnedTeam';

/** The attribute both passes set. Kept here so the script and the component cannot drift. */
export const PINNED_TEAM_ATTR = 'data-pinned';

/** On <html> while one of the fifteen schools is pinned: what the home card's height floor keys on. */
export const PINNED_TEAM_PRESENT_ATTR = 'data-has-pin';

/**
 * Every slug a pin can name. Typed as a record over `TeamSlug` so that adding or removing a school
 * from that union fails the typecheck until this list follows (a type-only import: nothing from
 * lib/ is bundled). The script needs the list before the page is parsed, and the snapshot is
 * read only on the server, so it is written out rather than derived.
 */
const SCHOOLS: Record<TeamSlug, true> = {
  cupertino: true,
  fremont: true,
  homestead: true,
  'los-altos': true,
  'saint-francis': true,
  'st-ignatius': true,
  'valley-christian': true,
  'los-gatos': true,
  lynbrook: true,
  mitty: true,
  'monta-vista': true,
  'palo-alto': true,
  presentation: true,
  'santa-clara': true,
  saratoga: true,
};

export const PINNED_TEAM_SLUGS: readonly string[] = Object.keys(SCHOOLS);

export const PINNED_TEAM_SCRIPT =
  `(function(){var s,d=document.documentElement;try{s=localStorage.getItem('${PINNED_TEAM_KEY}');` +
  `if(!s||!/^[a-z0-9-]+$/.test(s)||' ${PINNED_TEAM_SLUGS.join(' ')} '.indexOf(' '+s+' ')<0)return;` +
  `d.setAttribute('${PINNED_TEAM_PRESENT_ATTR}','')}catch(e){return}` +
  `function m(){var n=document.querySelectorAll('[data-team-slug="'+s+'"]');` +
  `for(var i=0;i<n.length;i++)n[i].setAttribute('${PINNED_TEAM_ATTR}','')}` +
  `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',m);else m()})();`;
