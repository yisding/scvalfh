/**
 * The OG cards' size and palette, shared by every `opengraph-image.tsx` route and the league
 * standings card (components/metadata/league-standings-card.tsx).
 *
 * Every card is a text-only `ImageResponse` on the site's navy band (DESIGN §12.4, §33), so a shared
 * link looks like the site's header: the colours are the band's tokens (app/globals.css `--sx-band*`),
 * the same in both themes. The names are the cards' older ones, kept so every route reads the same
 * keys: TEXT_2 and TEXT_3 are both the band's muted text. Satori takes literal colours, not CSS
 * variables, which is why they are restated here at all.
 *
 * Each route still exports its own `size` (`export const size = OG_SIZE`): the metadata-route
 * loaders read `alt`, `size` and `contentType` off the route module itself.
 */

/** Every card is 1200×630, the size link previews crop to. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The band tokens the cards paint with. */
export const OG = {
  /** --sx-band */
  BG: '#0c1b33',
  /** --sx-band-text */
  TEXT: '#ffffff',
  /** --sx-band-muted: secondary text */
  TEXT_2: '#aab6cc',
  /** --sx-band-muted: the quietest text is the same grey; a third grey on navy falls under AA */
  TEXT_3: '#aab6cc',
  /** --sx-band-3: the rules under a title and between rows */
  RULE: '#2c3c5c',
  /** --sx-band-3: the rule between the day card’s games */
  BORDER: '#2c3c5c',
  /** --sx-band-accent */
  ACCENT: '#8fb0ff',
} as const;
