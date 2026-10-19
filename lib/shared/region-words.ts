/**
 * The names of the two regions and the five sections, import-free so the client component that prints
 * them (`LeagueSwitcher`) can share them with the league config without pulling the config into the
 * client bundle: lib/config/leagues/regions.ts builds REGIONS and SECTIONS from this file, which is
 * the one place the words live. Pure data, ZERO imports
 * (`as const`, so the config keeps its literal types). `TeamFinder` prints two of the section names
 * itself, for a bundle-size reason its comment gives; tests/components/search/TeamFinder.test.ts holds it to these.
 */

/**
 * The section names, keyed by `SectionConfig['shortName']`. Reading a name that is not here is a
 * compile error, so a new section needs its words added in this file.
 */
export const SECTION_NAMES = {
  CCS: 'Central Coast Section',
  NCS: 'North Coast Section',
  NS: 'Northern Section',
  SS: 'Southern Section',
  SDS: 'San Diego Section',
} as const;

/**
 * The two regions' words, keyed by `RegionId`: `shortName` on the region switcher's buttons, `name`
 * in headings and the live-region sentence. NorCal first: the default view and the JS-free reading
 * order.
 */
export const REGION_WORDS = {
  norcal: { shortName: 'NorCal', name: 'Northern California' },
  socal: { shortName: 'SoCal', name: 'Southern California' },
} as const;
