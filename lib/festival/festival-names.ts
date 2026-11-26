/**
 * The name rules the festival's slugs are made by, shared by the build-time normalizer
 * (lib/sources/tourneymachine.ts: division and team slugs) and the read API (lib/festival/festival.ts:
 * automatic club names and slugs), so both sides cut a TourneyMachine team name the same way.
 *
 * Pure, with no imports: lib/sources may import lib/festival, never the other way round
 * (tests/build-only-boundary.test.ts).
 */

/** Words the festival's URLs never take as a division slug: the static routes beside /festival/[division]. */
export const FESTIVAL_RESERVED_SLUGS: readonly string[] = ['clubs', 'teams', 'schedule'];

/** An age token anywhere in a team name: 'U14', 'u16', 'U-19'. */
const AGE_TOKEN = /\bu-?\d+\b/gi;

/**
 * A team name as the festival pages print it: the feed's own words, with every age token's `u` capitalised
 * ('Atlanta FHC u10' → 'Atlanta FHC U10', 'Norcal Wolves u16' → 'Norcal Wolves U16'), so a division's teams read
 * alike (owner decision, 2026-11-26). Nothing else is changed: 'Florida United white' keeps its lower-case colour.
 * Slugs and club matching are case-blind, so this never moves a URL.
 */
export function displayTeamName(name: string): string {
  return name.trim().replace(AGE_TOKEN, (token) => `U${token.slice(1)}`);
}

/** 'San Francisco Hawks U16' → 'san-francisco-hawks'; 'New York H.C.' → 'new-york-h-c'; nothing usable → ''. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A team name with every age token removed and whitespace collapsed: 'AGH U14 1' → 'AGH 1'; may be ''. */
export function withoutAgeTokens(name: string): string {
  return name.replace(AGE_TOKEN, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The club a team name implies when no curated club matches it (DESIGN §35): age tokens and a trailing lone
 * digit removed ('AGH U16 2' → 'AGH'), else the whole name.
 */
export function automaticClubName(teamName: string): string {
  const name = withoutAgeTokens(teamName).replace(/\s+\d$/, '').trim();
  return name || teamName.trim();
}

/**
 * The text a curated club's `match` prefixes are tried against: the name lower-cased, with a leading age token
 * removed ('U14 Gateway Red Stars' → 'gateway red stars').
 */
export function clubMatchText(teamName: string): string {
  return teamName.trim().replace(/^u-?\d+\s+/i, '').replace(/\s+/g, ' ').toLowerCase();
}

/** Whether `prefix` starts `text` and ends at a word boundary: 'htc' matches 'htc ca u19' but not 'htcx'. */
export function matchesPrefix(text: string, prefix: string): boolean {
  if (!text.startsWith(prefix)) return false;
  const next = text.charAt(prefix.length);
  return next === '' || !/[a-z0-9]/.test(next);
}

/** `base`, else `base-2`, `base-3` … whichever `taken` does not hold yet; the result is added to `taken`. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}
