/**
 * The remembered league, the CSS half (SPEC §8.2). `app/layout.tsx` renders this as an UNLAYERED
 * inline `<style>` in `<head>`: Tailwind cannot generate a selector per (league id × attribute)
 * pair, and an unlayered rule outranks every `@layer`, utilities included, so the pre-paint state
 * always wins over a component's own classes.
 *
 * Everything keys off the attributes the prefs script stamps on `<html>` before first paint
 * (components/layout/prefs-script.ts):
 *
 * - `[data-scope="<id>"]`  shown only when that league is the effective league;
 *   `[data-scope="none"]`  shown only when there is none (the first-visit view);
 *   `[data-scope="all"]`   always shown.
 * - `.sx-jump-<id>`        the "Jump to <SHORT> ↓" link of the effective league only.
 * - `.sx-js-only`          hidden without JS (nothing stamped `data-js`).
 * - `.sx-myteam-slot`      the WRAPPING `<section>` of the home My-team slot (heading included, so
 *                          it is never orphaned): hidden with no pin, no league and no stale pin.
 *                          Its HEIGHTS are not here — the component that owns the content sets them
 *                          with Tailwind arbitrary variants (SPEC §10.1).
 * - `[data-league-option="<id>"]`  the scope chips: the effective league's chip (or `all` when
 *                          there is none) is drawn selected, with its aria-hidden ✓ shown, before
 *                          hydration. Never colour alone: fill + ring + the ✓.
 *
 * No league hue anywhere (DESIGN §6.4): every selected state is the one accent wash.
 * `display: none` also removes a hidden panel from the accessibility tree; DOM order stays the
 * visual order (WCAG 1.3.2 / 2.4.3).
 */

const ID = /^[a-z0-9-]+$/;

/** The selected chip: accent-wash fill, accent ink, weight 600, a 1.5 px ink ring. */
const SELECTED =
  'background:var(--sx-accent-wash);color:var(--sx-accent-ink);font-weight:600;box-shadow:inset 0 0 0 1.5px var(--sx-text)';

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
  rules.push('.sx-jump{display:none}');
  for (const id of leagueIds) rules.push(`html[data-league="${id}"] .sx-jump-${id}{display:inline-flex}`);
  rules.push('html:not([data-js]) .sx-js-only{display:none !important}');
  rules.push('html:not([data-pin]):not([data-league]):not([data-pin-stale]) .sx-myteam-slot{display:none}');
  for (const id of leagueIds) {
    rules.push(`html[data-league="${id}"] [data-league-option="${id}"]{${SELECTED}}`);
    rules.push(`html[data-league="${id}"] [data-league-option="${id}"] .sx-chip-check{display:inline}`);
  }
  rules.push(`html:not([data-league]) [data-league-option="all"]{${SELECTED}}`);
  rules.push('html:not([data-league]) [data-league-option="all"] .sx-chip-check{display:inline}');
  return rules.join('\n');
}
