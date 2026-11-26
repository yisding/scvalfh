import type { FestivalClub } from '../../lib/festival/festival';
import { plural, recordString } from '../../lib/format';
import { clubHref, festivalModel, teamRef, type FestivalModel, type TeamRef } from './festival-model';
import { siteClubInfo, type SiteClubLookup } from './site-clubs';

/**
 * /festival/clubs (DESIGN §35 §6): every club with a team at the festival, A–Z, the California clubs first in
 * their own section (Northern, then Southern). A club is the curated one of data/field-hockey/festival-clubs.json
 * or, for a team no curated club matches, one named from the team (lib/festival/festival.ts).
 */
export interface ClubRowModel {
  slug: string;
  href: string;
  name: string;
  /** 'San Francisco' (this site's club region), or the curated region. */
  region: string | null;
  teams: TeamRef[];
  /** '3 teams'. */
  teamsWord: string;
  /** The teams' pool records added up: '7-3-1'; null before any of them has played. */
  record: string | null;
  site: { name: string; href: string } | null;
}

export interface ClubIndexGroupModel {
  id: 'norcal' | 'socal' | 'all';
  heading: string;
  clubs: ClubRowModel[];
}

export interface ClubIndexViewModel {
  /** California clubs (Northern, then Southern), then every other club A–Z. */
  groups: ClubIndexGroupModel[];
  clubs: number;
  teams: number;
}

export function clubRow(m: FestivalModel, club: FestivalClub, site: SiteClubLookup = siteClubInfo): ClubRowModel {
  const info = club.siteClub ? site(club.siteClub) : null;
  const total = { w: 0, l: 0, t: 0 };
  for (const id of club.teamIds) {
    const r = m.teamById.get(id)!.record;
    total.w += r.w;
    total.l += r.l;
    total.t += r.t;
  }
  return {
    slug: club.slug,
    href: clubHref(club.slug),
    name: club.name,
    region: info?.regionLabel ?? club.region,
    teams: club.teamIds.map((id) => teamRef(m, id)),
    teamsWord: plural(club.teamIds.length, 'team'),
    record: total.w + total.l + total.t > 0 ? recordString(total) : null,
    site: info ? { name: info.name, href: info.href } : null,
  };
}

export function buildClubIndexView(m: FestivalModel = festivalModel(), site: SiteClubLookup = siteClubInfo): ClubIndexViewModel {
  const norcal: ClubRowModel[] = [];
  const socal: ClubRowModel[] = [];
  const rest: ClubRowModel[] = [];
  for (const club of m.clubs) {
    const row = clubRow(m, club, site);
    if (!club.california) rest.push(row);
    else {
      const half = (club.siteClub ? site(club.siteClub)?.siteRegion : null) ?? (club.norCal ? 'norcal' : 'socal');
      (half === 'norcal' ? norcal : socal).push(row);
    }
  }
  const groups: ClubIndexGroupModel[] = [
    { id: 'norcal' as const, heading: 'Northern California', clubs: norcal },
    { id: 'socal' as const, heading: 'Southern California', clubs: socal },
    { id: 'all' as const, heading: norcal.length + socal.length > 0 ? 'Every other club' : 'Every club', clubs: rest },
  ].filter((g) => g.clubs.length > 0);
  return { groups, clubs: m.clubs.length, teams: m.file.teams.length };
}
