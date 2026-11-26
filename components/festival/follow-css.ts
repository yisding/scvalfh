import { FEST_FOLLOW_ATTR } from './follow-script';

/**
 * The followed teams, the CSS half (DESIGN §35; the pattern of components/prefs/league-scope-css.ts). The head
 * script stamps `<html data-fest-follow="slug slug">` before first paint (components/festival/follow-script.ts);
 * the festival layout renders this sheet, so a followed team is marked in the first paint of every festival
 * page and after every client-side navigation, with no React and no hydration.
 *
 * Markup hooks, all in the `data-fest-*` namespace so the site's pinned-team rules (`data-team-slug`) never
 * touch them:
 * - `[data-fest-team="<slug>"]` wraps ONE team's name and a hidden star (`.sx-pin-note` carrying the words
 *   "Following"). A followed team's wrapper is bold and its star shows: a star and a bold name, never a fill
 *   or a bar (DESIGN §33, tests/ui/design-rules.test.ts), and never colour alone (the star's words). Team
 *   wrappers never nest.
 * - `[data-fest-card="<slug>"]` (the hub's "Your teams", `cards: true` only) ships `hidden` and is shown for
 *   a followed team.
 * - `[data-fest-empty]` (the hub's empty state) is hidden once anything is followed.
 *
 * Inside `@layer base`, not unlayered: Tailwind's preflight hides `[hidden]` with an `!important` in that
 * layer, and an important declaration in a layer beats an unlayered one. In the same layer the more specific
 * selector wins. One selector per slug: the per-slug rule only sets a custom property and the weight on the
 * wrapper, and one fixed rule turns the property into the star's `display`.
 *
 * Slugs are written unquoted, so each must be a CSS identifier: a letter, then `[a-z0-9-]`. Anything else
 * throws at build time, so a slug can never break out of the sheet.
 */
const IDENT = /^[a-z][a-z0-9-]*$/;

export interface FestivalFollowCssOptions {
  /** The stars and bold names (default true): the layout's sheet. */
  marks?: boolean;
  /** The "Your teams" cards and their empty state: the hub's own sheet (no other page carries them). */
  cards?: boolean;
}

export function buildFestivalFollowCss(slugs: readonly string[], opts: FestivalFollowCssOptions = {}): string {
  for (const slug of slugs) {
    if (!IDENT.test(slug)) throw new Error(`follow-css: "${slug}" is not a CSS identifier`);
  }
  const on = (slug: string, hook: string) => `[${FEST_FOLLOW_ATTR}~=${slug}] [${hook}=${slug}]`;
  const rules: string[] = [];
  if (opts.marks ?? true) {
    rules.push('[data-fest-team]{--sx-fest-pin:none}', '[data-fest-team]>.sx-pin-note[hidden]{display:var(--sx-fest-pin)!important}');
  }
  if ((opts.marks ?? true) && slugs.length > 0) {
    rules.push(`${slugs.map((s) => on(s, 'data-fest-team')).join(',')}{--sx-fest-pin:inline-block;font-weight:700}`);
  }
  if (opts.cards) {
    rules.push(`html[${FEST_FOLLOW_ATTR}] [data-fest-empty]{display:none!important}`);
    if (slugs.length > 0) {
      rules.push(`${slugs.map((s) => on(s, 'data-fest-card')).join(',')}{display:block!important}`);
    }
  }
  return `@layer base{${rules.join('')}}`;
}
