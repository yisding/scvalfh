/**
 * Reveal a disclosure that opens under the bottom tab bar.
 *
 * Every expandable thing on this site is a native `<details>`/`<summary>` (a game row's venue and
 * sources, the "How to read …" notes), so it opens with zero JavaScript. What the browser does NOT
 * do is bring the panel into view: tap a game row in the bottom band of a phone screen and its new
 * panel opens BELOW the fold, behind the fixed 56px tab bar, so the tap looks like it did nothing.
 *
 * This ~300-byte head script listens for clicks on a `<summary>` that is the first child of its
 * `<details>` (the only summary the browser treats as the toggle) and, one frame later, once the
 * element is open, calls `scrollIntoView({ block: 'nearest' })`. `nearest` is what keeps it quiet:
 * a panel that is already fully on screen does not move at all, a short one is lifted just far
 * enough to clear the tab bar (html's `scroll-padding-bottom` in globals.css), and one taller
 * than the screen is aligned by its TOP, under `scroll-padding-top`, so its summary stays visible.
 * Closing never scrolls (the frame callback checks `open`).
 *
 * Why `click` and not the `toggle` event: `toggle` also fires for a `<details open>` in the markup
 * (/teams/[slug] renders the next game expanded) and for find-in-page and script opens, so it would
 * scroll the page on load and under the reader's search. It does not bubble either, which would
 * need a capturing listener. A click on the summary (Enter and Space on a focused summary dispatch
 * one too) is exactly "the reader opened this".
 *
 * A document-level listener, so it costs no React and survives every client-side navigation, and it
 * sits in <head> beside the theme stamp because React drops an inline <script> rendered in <body>
 * (see pinned-team-script.ts). The whole body is in try/catch: if anything throws, disclosures
 * still open; they just are not scrolled.
 */
export const DISCLOSURE_SCRIPT = `try{document.addEventListener('click',function(e){var t=e.target,s=t&&t.closest?t.closest('summary'):null,d=s&&s.parentElement;if(!d||d.tagName!=='DETAILS'||d.firstElementChild!==s)return;requestAnimationFrame(function(){if(d.open)d.scrollIntoView({block:'nearest'})})})}catch(e){}`;
