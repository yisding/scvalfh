/**
 * Reveal a disclosure that opens under the bottom tab bar.
 *
 * Every expandable thing on this site is a native `<details>`/`<summary>` (a game row's venue and
 * sources, the "How to read …" notes), so it opens with zero JavaScript. What the browser does NOT
 * do is bring the panel into view: tap a game row in the bottom band of a phone screen and its new
 * panel opens BELOW the fold, behind the fixed 56px tab bar, so the tap looks like it did nothing.
 *
 * This ~500-byte head script listens for clicks on a `<summary>` that is the first child of its
 * `<details>` (the only summary the browser treats as the toggle), notes the summary's viewport top
 * (the listener runs before the default toggle) and, one frame later, once the element is open,
 * first puts the summary back where it was tapped (see scroll anchoring below), then, if its
 * bottom ends under the tab bar (below `innerHeight` minus html's computed
 * `scroll-padding-bottom` in globals.css: 57px on phones, 0 from 768px), calls
 * `scrollIntoView({ block: 'nearest' })`. A short panel is lifted just far enough to clear the tab
 * bar, and one taller than the screen is aligned by its TOP, under `scroll-padding-top`, so its
 * summary stays visible. Closing never scrolls (the frame callback checks `open`).
 *
 * Why the bottom check before `nearest`: html's `scroll-padding-top` (104px on phones, 120px on
 * desktop) reserves room for the second sticky bar that only multi-division /standings/<league>,
 * /schedule/<league> (its date header) and /history have, so `nearest` treats a row tapped between
 * the top bar and that line as off screen and pulls it down by up to 56px under the reader's
 * finger, on every page without one (home, /standings, single-division standings, team and game
 * pages). Scrolling only when the panel actually ends under the tab bar leaves those rows still.
 *
 * Why the summary is put back first: the same scroll-padding-top also narrows the box Chromium
 * picks its scroll anchor from. A summary whose bottom sits above that line is skipped, the anchor
 * becomes content BELOW the `<details>`, and opening the panel scrolls the page up by the panel's
 * full height, hiding the summary just tapped behind the top bar. Measuring the summary's top
 * before and after the toggle and scrolling by the difference undoes that (a no-op where nothing
 * moved, and in browsers without anchoring), without turning anchoring off site-wide (the
 * content-visibility date groups on /schedule rely on it). `behavior: 'instant'` overrides html's
 * smooth scrolling so the correction is not animated.
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
export const DISCLOSURE_SCRIPT = `try{document.addEventListener('click',function(e){var t=e.target,s=t&&t.closest?t.closest('summary'):null,d=s&&s.parentElement;if(!d||d.tagName!=='DETAILS'||d.firstElementChild!==s)return;var y=s.getBoundingClientRect().top;requestAnimationFrame(function(){if(!d.open)return;var dy=s.getBoundingClientRect().top-y;if(dy)scrollBy({top:dy,behavior:'instant'});if(d.getBoundingClientRect().bottom>innerHeight-(parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom)||0))d.scrollIntoView({block:'nearest'})})})}catch(e){}`;
