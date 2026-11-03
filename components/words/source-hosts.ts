/**
 * What the clubs and commitments pages share about the sources they link (DESIGN §17, §21): the
 * host and path of a source URL, the one table of news and other outlets a source can sit on, the
 * " (2)" numbering that keeps two links from reading the same, and a school's registry name.
 *
 * One OUTLETS table, so a host gets the same name on /clubs and on /commits. Each view keeps its
 * own platform table and its own fallbacks (components/clubs/club-view.ts,
 * components/commits/commit-view.ts). Server-only: it reads the registry.
 */

import { getTeamBySlug } from '../../lib/teams';

/**
 * A news or other site a source sits on: its link text, and how a sentence names it. Any other
 * host is printed as itself.
 */
export const OUTLETS: Readonly<Record<string, { label: string; inSentence: string }>> = {
  'sticktogetherfh.com': { label: 'Stick Together', inSentence: 'Stick Together' },
  'fhcollegepath.com': { label: 'FH College Path', inSentence: 'FH College Path' },
  'gilroydispatch.com': { label: 'Gilroy Dispatch', inSentence: 'the Gilroy Dispatch' },
  'lahstalon.org': { label: 'The Talon', inSentence: 'The Talon' },
  'lacrossemasters.com': { label: 'Lacrosse Masters', inSentence: 'Lacrosse Masters' },
  'losaltosonline.com': { label: 'Los Altos Town Crier', inSentence: 'the Los Altos Town Crier' },
  'marinij.com': { label: 'Marin Independent Journal', inSentence: 'the Marin Independent Journal' },
  'maxfh.longstreth.com': { label: 'MAX Field Hockey', inSentence: 'MAX Field Hockey' },
  'maxfieldhockey.com': { label: 'MAX Field Hockey', inSentence: 'MAX Field Hockey' },
  'mercurynews.com': { label: 'Mercury News', inSentence: 'the Mercury News' },
  'nfhca.org': { label: 'NFHCA', inSentence: 'the NFHCA' },
  'paloaltoonline.com': { label: 'Palo Alto Online', inSentence: 'Palo Alto Online' },
  'saratogafalcon.org': { label: 'The Saratoga Falcon', inSentence: 'The Saratoga Falcon' },
  'scval.com': { label: 'SCVAL', inSentence: 'SCVAL' },
  'sfhsathletics.com': { label: 'Saint Francis athletics', inSentence: 'Saint Francis athletics' },
  'siwildcats.com': { label: 'St. Ignatius athletics', inSentence: 'St. Ignatius athletics' },
};

/** The host without `www.`: "flyfhc.com", "nfhca.sportsrecruits.com". Every URL here is https (the schemas). */
export function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

export function pathOf(url: string): string {
  return new URL(url).pathname;
}

/** " (2)", " (3)" on a label that repeats within one list, so no two links read the same. */
export function numbered<T extends { label: string }>(links: T[]): T[] {
  const seen = new Map<string, number>();
  return links.map((link) => {
    const n = (seen.get(link.label) ?? 0) + 1;
    seen.set(link.label, n);
    return n === 1 ? link : { ...link, label: `${link.label} (${n})` };
  });
}

/** The school a team slug is, by its registry name ("Archbishop Mitty"). */
export function schoolName(slug: string): string {
  return getTeamBySlug(slug)?.name ?? slug;
}
