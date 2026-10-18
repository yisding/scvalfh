/**
 * The route segments the configuration must keep clear of: an import-free table the league assert
 * (lib/config/leagues/assert.ts) checks every region and league id against.
 */

/**
 * Route segments a league id may never equal (siblings of /standings/[league], /schedule/[league],
 * /playoffs/[league]), plus the two region ids: 'norcal' and 'socal' are page anchors and `data-region-scope`
 * values (DESIGN-socal §2.4), so no section, league or division may take one (asserted).
 */
export const RESERVED_SEGMENTS = [
  'opengraph-image', 'twitter-image', 'icon', 'apple-icon', 'sitemap', 'robots', 'manifest', 'norcal', 'socal',
] as const;
