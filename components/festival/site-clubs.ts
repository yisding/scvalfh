import { REGION_WORDS } from '../clubs/club-view';
import { clubDisplayName, getClub } from '../../lib/players/clubs';
import { CLUB_REGION_SITE_REGION } from '../../lib/players/clubs-schema';

/**
 * A festival club's page on this site (data/field-hockey/clubs.json, /clubs/<slug>), as the festival pages name
 * it (DESIGN §35): its display name, its region in the club pages' own words ("San Diego", "East Bay"), and the
 * half of California it is in, which splits the hub's and /festival/clubs' California teams into Northern and
 * Southern. A lookup the view builders take as a parameter, so a view test can stand one in.
 */
export interface SiteClubInfo {
  slug: string;
  /** 'SF Hawks', 'HTC'. */
  name: string;
  href: string;
  /** 'San Francisco', 'San Diego'. */
  regionLabel: string;
  siteRegion: 'norcal' | 'socal' | null;
  /** The club's website and its one-line description on its page on this site (data/field-hockey/clubs.json). */
  website: string | null;
  description: string | null;
}

export type SiteClubLookup = (slug: string) => SiteClubInfo | null;

export const siteClubInfo: SiteClubLookup = (slug) => {
  const club = getClub(slug);
  if (!club) return null;
  return {
    slug: club.slug,
    name: clubDisplayName(club),
    href: `/clubs/${club.slug}`,
    regionLabel: REGION_WORDS[club.region].label,
    siteRegion: CLUB_REGION_SITE_REGION[club.region],
    website: club.website ?? null,
    description: club.description ?? null,
  };
};
