/**
 * The words a club page or a club line uses about a club tie (SPEC §1.1j2, DESIGN §17): a region's
 * heading and its preposition, a source's link text and its name in a sentence, and a tie's
 * status. Link labels come from the source kind and the host, never from a URL path, apart from the
 * page-type tests (`/athlete/`, `/roster`, `/organization/`), so a label stays true when a page
 * moves (views/clubs/club-view.ts).
 */

import {
  type AffiliationSource,
  type Club,
  type ClubAffiliation,
  type ClubRegion,
  clubDisplayName,
} from '@/lib/datasets/clubs';
import { partialDate, partialDateKind } from '@/lib/format/dates';
import { listWords } from '@/lib/format/words';
import { clubSiteKey } from '@/lib/schema/clubs';
import { OUTLETS, PLATFORMS, clubBySite, hostOf, pathOf, sportsRecruitsLabel } from '@/views/shared/source-links';

/**
 * A region's heading, and how a sentence says a club is based there: "in San Francisco", "on the
 * Peninsula". The order is CLUB_REGIONS'.
 */
export const REGION_WORDS: Record<ClubRegion, { label: string; prep: 'in' | 'on'; place: string }> = {
  'san-francisco': { label: 'San Francisco', prep: 'in', place: 'San Francisco' },
  peninsula: { label: 'Peninsula', prep: 'on', place: 'the Peninsula' },
  'south-bay': { label: 'South Bay', prep: 'in', place: 'the South Bay' },
  'east-bay': { label: 'East Bay', prep: 'in', place: 'the East Bay' },
  marin: { label: 'Marin', prep: 'in', place: 'Marin' },
  'central-coast': { label: 'Central Coast', prep: 'on', place: 'the Central Coast' },
  // Not searched (SEARCHED_REGIONS): D-City (Davis) and Roseville FHC, met near the EAL teams' schools.
  // "Sacramento" alone would read as the city.
  sacramento: { label: 'Sacramento area', prep: 'in', place: 'the Sacramento area' },
  // Not searched (SEARCHED_REGIONS): Chico Hotshots, met near the EAL teams' schools.
  'north-state': { label: 'North State', prep: 'in', place: 'the North State' },
  // The Southern California areas of the 2026-10-06 sweep, each searched (SEARCHED_REGIONS).
  ventura: { label: 'Ventura County', prep: 'in', place: 'Ventura County' },
  'los-angeles': { label: 'Los Angeles', prep: 'in', place: 'Los Angeles' },
  'orange-county': { label: 'Orange County', prep: 'in', place: 'Orange County' },
  'inland-empire': { label: 'Inland Empire', prep: 'in', place: 'the Inland Empire' },
  'san-diego': { label: 'San Diego', prep: 'in', place: 'San Diego' },
  // Never searched (SEARCHED_REGIONS), so never in a "no club based …" sentence.
  elsewhere: { label: 'Elsewhere', prep: 'in', place: 'other places' },
};

/**
 * "on the Peninsula or the Central Coast", "in the East Bay or on the Central Coast": the
 * preposition is repeated only where it changes.
 */
export function basedWords(regions: readonly ClubRegion[]): string {
  return listWords(
    regions.map((r, i) => {
      const w = REGION_WORDS[r];
      return i > 0 && REGION_WORDS[regions[i - 1]].prep === w.prep ? w.place : `${w.prep} ${w.place}`;
    }),
    'or',
  );
}

/** The recruiting-platform source kinds of a club page, by the platform whose words they read. */
const PLATFORM_OF_KIND = {
  ncsa: 'ncsa',
  hudl: 'hudl',
  fieldlevel: 'fieldlevel',
  'maxpreps-career': 'maxpreps',
} as const;

/** Whether `url` is on `club`'s own site. */
export function isOwnSite(url: string, club: Club): boolean {
  return club.website !== null && clubSiteKey(url) === clubSiteKey(club.website);
}

function outlet(url: string): { label: string; inSentence: string } {
  const host = hostOf(url);
  if (host === 'maxpreps.com') {
    return { label: pathOf(url).includes('/roster') ? 'MaxPreps roster' : 'MaxPreps page', inSentence: 'MaxPreps' };
  }
  return OUTLETS[host] ?? { label: host, inSentence: host };
}

/**
 * A club-site source, relative to the club whose page shows it: this club's own site, another
 * club's (Bridget Schilb's earlier Fly club rests on NorCal Impact's page for her), or a host no
 * club record names (say, Fly's old sanjosefly.com).
 */
function clubSite(url: string, pageClub: Club): { owner: Club | null; roster: boolean } {
  const owner = clubBySite().get(clubSiteKey(url)) ?? null;
  const roster = owner !== null && (owner.rosterPages.includes(url) || pathOf(url).includes('/roster'));
  return { owner: owner && owner.slug === pageClub.slug ? pageClub : owner, roster };
}

/**
 * A source's link text on `pageClub`'s page: "SportsRecruits profile", "club roster",
 * "NorCal Impact site", "Gilroy Dispatch", or the bare host when nothing better is known.
 */
export function sourceLabel(src: Pick<AffiliationSource, 'url' | 'kind'>, pageClub: Club): string {
  switch (src.kind) {
    case 'sportsrecruits':
      return sportsRecruitsLabel(src.url, 'club');
    case 'ncsa':
    case 'hudl':
    case 'fieldlevel':
    case 'maxpreps-career':
      return PLATFORMS[PLATFORM_OF_KIND[src.kind]].label;
    case 'club-site': {
      const { owner, roster } = clubSite(src.url, pageClub);
      if (owner === null) return hostOf(src.url);
      if (owner === pageClub) return roster ? 'club roster' : 'club site';
      return `${clubDisplayName(owner)} ${roster ? 'roster' : 'site'}`;
    }
    default:
      return outlet(src.url).label;
  }
}

/** How a sentence names a source: "NCSA", "MaxPreps", "the Gilroy Dispatch", "the club’s site". */
export function sourceName(src: Pick<AffiliationSource, 'url' | 'kind'>, pageClub: Club): string {
  switch (src.kind) {
    case 'sportsrecruits':
      return PLATFORMS.sportsrecruits.inSentence;
    case 'ncsa':
    case 'hudl':
    case 'fieldlevel':
    case 'maxpreps-career':
      return PLATFORMS[PLATFORM_OF_KIND[src.kind]].inSentence;
    case 'club-site': {
      const { owner } = clubSite(src.url, pageClub);
      if (owner === null) return hostOf(src.url);
      return owner === pageClub ? 'the club’s site' : `${clubDisplayName(owner)}’s site`;
    }
    default:
      return outlet(src.url).inSentence;
  }
}

/**
 * A tie's status in words (DESIGN §17.3), on `pageClub`'s page:
 *
 *   asOf          current                      past                     unknown
 *   day/month/yr  Current, as of Jul 8, 2026   Earlier, Jul 18, 2025    Listed by the Gilroy Dispatch, Jul 18, 2025
 *   season        Current, 2025-26 season      Earlier, 2024-25 season  Listed by NCSA, 2024-25 season
 *   range         Current, 2025–2026           Earlier, 2019–2022       Listed by NCSA, 2015–2018
 *   none          Current                      Earlier                  Listed by NCSA; no date given
 *
 * "Listed by" names the source whose own date is the `asOf`, else the first source.
 */
export function statusWords(aff: Pick<ClubAffiliation, 'status' | 'asOf' | 'sources'>, pageClub: Club): string {
  const when = aff.asOf === null ? null : partialDate(aff.asOf);
  switch (aff.status) {
    case 'current': {
      if (when === null) return 'Current';
      const kind = partialDateKind(aff.asOf!);
      return kind === 'season' || kind === 'range' ? `Current, ${when}` : `Current, as of ${when}`;
    }
    case 'past':
      return when === null ? 'Earlier' : `Earlier, ${when}`;
    case 'unknown': {
      const by = aff.sources.find((s) => s.sourceDate !== null && s.sourceDate === aff.asOf) ?? aff.sources[0];
      const name = sourceName(by, pageClub);
      return when === null ? `Listed by ${name}; no date given` : `Listed by ${name}, ${when}`;
    }
  }
}
