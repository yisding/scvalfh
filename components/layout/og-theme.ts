/**
 * The OG cards' size and palette, shared by every `opengraph-image.tsx` route and the league
 * standings card (components/standings/league-standings-card.tsx).
 *
 * Every card is a dark, text-only `ImageResponse` (DESIGN §12.4). Its colours are the DARK theme's
 * tokens and are named after them (app/globals.css, the `--sx-*` block under
 * `prefers-color-scheme: dark` and `[data-theme='dark']`), so a name means one grey in every card:
 * TEXT_2 is `--sx-text-2`, TEXT_3 is `--sx-text-3`. Satori takes literal colours, not CSS variables,
 * which is why they are restated here at all.
 *
 * Each route still exports its own `size` (`export const size = OG_SIZE`): the metadata-route
 * loaders read `alt`, `size` and `contentType` off the route module itself.
 */

/** Every card is 1200×630, the size link previews crop to. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The dark tokens the cards paint with. */
export const OG = {
  /** --sx-bg */
  BG: '#0b0d10',
  /** --sx-text */
  TEXT: '#f2f5f8',
  /** --sx-text-2 */
  TEXT_2: '#aab4bf',
  /** --sx-text-3 */
  TEXT_3: '#919ba5',
  /** --sx-border-strong: the rules under a title and between rows */
  RULE: '#3d444d',
  /** --sx-border: the lighter rule between the day card's games */
  BORDER: '#2b3138',
} as const;
