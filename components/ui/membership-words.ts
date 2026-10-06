import { getDivision, leagueOfDivision } from '../../lib/leagues';
import type { DivisionId, TeamSlug } from '../../lib/types';

/**
 * Where a division's membership comes from, in the words the no-results notes print (the standings
 * footnote, the playoff projection's notes). One rule, so the three places cannot drift.
 *
 * "{team} is in the {table} table as MaxPreps lists it" is printed ONLY when it is true: the league
 * publishes no documents of its own (`official.mode: 'none'`), the team is not one MaxPreps' table
 * leaves out (`maxprepsMissing`), and MaxPreps' table carries this division's name — its label or a
 * search alias, compared without case, spaces or punctuation, so MaxPreps' 'Eastern Athletic' is the
 * EAL's table, 'City - Western' is City Western's and 'Palomar' is Palomar's. That is the EAL case,
 * whose wording tests/ui/standings-view.test.ts pins byte for byte.
 *
 * The 2026-10-06 review found it printed where it is false: Newport Harbor is not in MaxPreps'
 * 2026-27 Sunset table (Sunset maxprepsMissing), Hilltop and Southwest are in no MaxPreps table for
 * Metro South Bay, and El Capitan and Granite Hills are in MaxPreps' 'Grossmont' table, while the
 * table MaxPreps names 'Metro- South Bay' holds the Metro Mesa teams. Those teams are placed by the
 * league’s own `alignmentSource` instead ("Hilltop is a Metro South Bay team (the CIF-SDS
 * 2026-27 League Alignment)"). A league with documents keeps "the official … alignment".
 */
export function listedAsMaxPrepsLists(division: DivisionId, slugs: readonly TeamSlug[]): boolean {
  const config = getDivision(division);
  if (config.official.mode !== 'none' || config.maxprepsName === null) return false;
  if (slugs.some((slug) => config.maxprepsMissing.includes(slug))) return false;
  const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const table = key(config.maxprepsName);
  return [config.label, ...config.searchAliases].some((name) => key(name) === table);
}

export type MembershipSource =
  | { kind: 'maxpreps' }
  | { kind: 'official' }
  | { kind: 'alignment'; source: string };

/** Which of the three wordings the teams `slugs` of `division` get (see listedAsMaxPrepsLists). */
export function membershipSource(division: DivisionId, slugs: readonly TeamSlug[]): MembershipSource {
  if (getDivision(division).official.mode !== 'none') return { kind: 'official' };
  if (listedAsMaxPrepsLists(division, slugs)) return { kind: 'maxpreps' };
  return { kind: 'alignment', source: leagueOfDivision(division).alignmentSource };
}

/**
 * 'a' or 'an' before a division name: "an Avocado team", "a Metro South Bay team". The callers say
 * "team", never "member": the copy rules (scripts/assert-copy.ts) forbid "Sunset member(s)".
 */
export function articleFor(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}
