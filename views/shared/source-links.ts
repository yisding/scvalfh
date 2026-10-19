/**
 * What the clubs, commitments and roster views share about the sources they link (DESIGN §17, §21):
 * the host and path of a source URL, the one table of news and other outlets a source can sit on
 * (OUTLETS), the one table of recruiting platforms (PLATFORMS: a profile's link text, how a
 * sentence names the platform, how a footnote does), the club whose own site a URL is on, the
 * " (2)" numbering that keeps two links from reading the same, and a school's registry name.
 *
 * One table of each, so a host or a platform gets the same words on /clubs, /commits and a team's
 * roster. The views keep only what is theirs: the fallbacks that depend on the page the link sits
 * on (a club's own site versus another club's, a college's athletics host, an official account
 * on X) and the order a roster lists its platforms in. Server-only: it reads the registry and the
 * club file.
 */

import { getClubs } from '@/lib/datasets/clubs';
import type { Club } from '@/lib/datasets/clubs';
import { getTeamBySlug } from '@/lib/registry/teams';
import { clubSiteKey } from '@/lib/schema/clubs';
import type { ProfilePlatform } from '@/lib/schema/rosters';

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

/**
 * A recruiting platform's words, by the platforms a roster row can link (`ProfilePlatform`, so a new
 * one fails typecheck until it is worded here): `label` is a profile link's text, `inSentence` how a
 * sentence names the platform ("Listed by NCSA"), `footnote` how the roster's footnote names it
 * ("NCSA", "personal sites"). The club and commitment source kinds that are a platform's profile
 * ('ncsa', 'hudl', 'fieldlevel', 'maxpreps-career' on a club's page; 'maxpreps' on a commitment's)
 * read their words from here; the page-type tests that choose between "profile" and "page" are the
 * views' (sportsRecruitsLabel is the shared one).
 */
export const PLATFORMS: Readonly<Record<ProfilePlatform, { label: string; inSentence: string; footnote: string }>> = {
  ncsa: { label: 'NCSA profile', inSentence: 'NCSA', footnote: 'NCSA' },
  sportsrecruits: { label: 'SportsRecruits profile', inSentence: 'SportsRecruits', footnote: 'SportsRecruits' },
  fieldlevel: { label: 'FieldLevel profile', inSentence: 'FieldLevel', footnote: 'FieldLevel' },
  hudl: { label: 'Hudl profile', inSentence: 'Hudl', footnote: 'Hudl' },
  captainu: { label: 'Captain U profile', inSentence: 'Captain U', footnote: 'Captain U' },
  maxpreps: { label: 'MaxPreps profile', inSentence: 'MaxPreps', footnote: 'MaxPreps' },
  // A site built for one athlete, on any host. No sentence names it yet; the footnote's words stand in.
  personal: { label: 'Recruiting site', inSentence: 'personal sites', footnote: 'personal sites' },
};

/** Whether a host is SportsRecruits or one of its subdomains ("nfhca.sportsrecruits.com"). */
export const isSportsRecruits = (host: string) => host === 'sportsrecruits.com' || host.endsWith('.sportsrecruits.com');

/**
 * A SportsRecruits link's text. An athlete's page is a "profile" anywhere; any other page is named by
 * what the page it sits on links it for: a club's page links a team page, a commitment's links a college's
 * recruiting page (it lists the committed athletes) or, failing that, just a page.
 */
export function sportsRecruitsLabel(url: string, context: 'club' | 'commit'): string {
  const path = pathOf(url);
  if (path.includes('/athlete/')) return PLATFORMS.sportsrecruits.label;
  if (context === 'club') return 'SportsRecruits team page';
  return path.includes('/athletic-scholarships/') ? 'SportsRecruits college page' : 'SportsRecruits page';
}

let clubsBySite: ReadonlyMap<string, Club> | undefined;

/**
 * Which club's own site a URL is on: every club of data/clubs.json with a website, keyed by
 * clubSiteKey (a host, or a site on a shared host). Built on first use; the club file is fixed for
 * the process.
 */
export function clubBySite(): ReadonlyMap<string, Club> {
  clubsBySite ??= new Map(getClubs().flatMap((c) => (c.website ? [[clubSiteKey(c.website), c] as const] : [])));
  return clubsBySite;
}
