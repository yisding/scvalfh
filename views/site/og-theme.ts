/**
 * The OG cards' size, content type and palette, and the one footer phrase two cards share, for the
 * card kit in components/og/ (primitives.tsx, png.ts and one card per route) and every
 * `opengraph-image.tsx` route.
 *
 * Every card is a dark, text-only `ImageResponse` (DESIGN §12.4). Its colours are the DARK theme's
 * tokens and are named after them (app/globals.css, the `--sx-*` block under
 * `prefers-color-scheme: dark` and `[data-theme='dark']`), so a name means one grey in every card:
 * TEXT_2 is `--sx-text-2`, TEXT_3 is `--sx-text-3`. Satori takes literal colours, not CSS variables,
 * which is why they are restated here at all. The background is the very constant the layout's
 * dark theme-color meta reads (lib/shared/theme.ts).
 *
 * Each route still exports its own `alt`, `size` and `contentType` (`export const size = OG_SIZE`,
 * `export const contentType = OG_CONTENT_TYPE`): the metadata-route loaders read them off the
 * route module itself (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * 01-metadata/opengraph-image.md, "Config exports").
 */

import { formatStamp } from '@/lib/format/dates';
import { THEME_COLOR } from '@/lib/shared/theme';

/** Every card is 1200×630, the size link previews crop to. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Every card is a PNG (what `ImageResponse` writes). */
export const OG_CONTENT_TYPE = 'image/png';

/** The dark tokens the cards paint with. */
export const OG = {
  /** --sx-bg */
  BG: THEME_COLOR.dark,
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
  /** The region card's leader lines: a grey between TEXT and TEXT_2 that has no `--sx-*` token. */
  LEADER_TEXT: '#d5dbe1',
} as const;

/**
 * The `FH` monogram's two colours (components/og/monogram-image.tsx): the LIGHT theme's `--sx-text`
 * as the square and the dark theme's `--sx-text` as the letters.
 */
export const MONOGRAM = {
  /** --sx-text (light) */
  BG: '#0e1116',
  /** --sx-text (dark) */
  INK: '#f2f5f8',
} as const;

/**
 * `As of Fri Oct 2, 6:05 AM PT · league games only · unofficial`: the footer of the team card and
 * the league standings card, which both print league numbers as of the snapshot's `fetchedAt`
 * (passed in, so this module never loads the snapshot: views/site/site.ts imports it for OG_SIZE).
 */
export function asOfLeagueGamesWords(fetchedAt: string): string {
  return `As of ${formatStamp(fetchedAt)} · league games only · unofficial`;
}
