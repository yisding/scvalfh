/**
 * The pinned-team highlight, pass one: mark the pinned rows BEFORE first paint (DESIGN §3.2
 * "▓ = pinned", §3.6).
 *
 * The pin lives in `localStorage` and nothing about it leaves the browser, so the server cannot
 * know it — but /standings, /teams and the home page's mini tables are fully static pages whose
 * only need is to mark ONE row. A ~250-byte inline script reads the slug and sets `data-pinned` on
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
 * An ATTRIBUTE, not a class, on purpose: the script must never touch an element's own className,
 * which carries its utilities and, on the home pinned card (components/home/MyTeamCard.tsx), a
 * literal `.sx-pinned`. app/globals.css styles `.sx-pinned` and `[data-pinned]` identically.
 *
 * The same rule reveals a visually hidden "your team" note (`.sx-pin-note`), so the marker is never
 * carried by colour alone (DESIGN §6.5). The note ships with the `hidden` attribute and only that
 * rule overrides it, so without the stylesheet (reader modes) no row claims to be "your team".
 *
 * Reading storage can throw in a private window or with site data blocked, so the whole body is
 * in a try/catch and the page is simply unmarked when it does — exactly like the theme stamp.
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

export const PINNED_TEAM_SCRIPT =
  `(function(){function m(){try{var s=localStorage.getItem('${PINNED_TEAM_KEY}');` +
  `if(!s||!/^[a-z0-9-]+$/.test(s))return;` +
  `var n=document.querySelectorAll('[data-team-slug="'+s+'"]');` +
  `for(var i=0;i<n.length;i++)n[i].setAttribute('${PINNED_TEAM_ATTR}','')}catch(e){}}` +
  `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',m);else m()})();`;
