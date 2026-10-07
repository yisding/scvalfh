/**
 * The recruiting page (/recruiting), derived from the team rosters' own rows. Pure, so
 * tests/ui/recruiting-view.test.ts can assert it over the real files.
 *
 * One page for every school's recruiting data: the players' own recruiting profiles (the roster
 * overlay, data/rosters-enrichment.json), the youth clubs a public page ties them to
 * (data/clubs.json) and the college commitments a public page reports (data/commits.json). Each
 * team page already shows the same three lines on its roster; this page gathers them, region →
 * league → school, under the NorCal/SoCal switcher.
 *
 * What it promises, and this module enforces:
 *   - the same rows and the same words as the team pages: every row here is a row of
 *     components/teams/roster-view.ts buildRosterView (varsity only, the roster's own spelling and
 *     order), so its commitment line, club line and profile links are the ones the school's page
 *     shows, with nothing the data files keep but never render (a quote, a basis, a confidence);
 *   - a player is listed only when one of the three exists for them; a school with none says so,
 *     and so does a school with no roster to match against, so no school silently drops out;
 *   - no value here is marked †: a row carries its facts as plain text, and the team page, which
 *     each school's heading links, says where each came from.
 */

import { getClubsFile } from '../../lib/clubs';
import { getCommitsFile } from '../../lib/commits';
import { getTeamsGrouped, type LeagueSummary } from '../../lib/data';
import { dateWithYear, listWords } from '../../lib/format';
import { REGIONS, getLeague } from '../../lib/leagues';
import { getRosterEnrichment, getRosters } from '../../lib/rosters';
import type { RegionId, TeamSlug } from '../../lib/types';
import { buildRosterView, type RosterRow } from '../teams/roster-view';
import { plural } from '../ui/plural';

/** A roster row with something to show here: its commitment, clubs and profiles, as the team page has them. */
export interface RecruitingRow extends Pick<RosterRow, 'key' | 'name' | 'commitment' | 'clubs' | 'profiles'> {
  /** Grade, position(s), height: the team page's facts as plain text. */
  facts: string[];
}

export interface RecruitingSchool {
  slug: TeamSlug;
  /** The school's anchor: `#<team slug>`. */
  id: string;
  name: string;
  /** `/teams/<slug>#roster`: the school's own roster, with every source. */
  href: string;
  /** "3 players · 1 committed · 2 with a club · 3 with a profile": only the counts that are not zero. */
  meta: string;
  rows: RecruitingRow[];
}

export interface RecruitingLeague {
  /** The league id, the section's anchor (`#scval`), as on /teams. */
  id: string;
  /** "SCVAL — Santa Clara Valley Athletic League"; a group of independents by its name. */
  title: string;
  /** "12 players at 5 of 15 schools" */
  meta: string;
  /** `LeagueConfig.membershipNote`: printed under the heading when its schools are not all in its section (EAL). */
  membershipNote: string | null;
  /** The schools with a listed player, by name. */
  schools: RecruitingSchool[];
  /** Schools with roster rows, none of them listed here, by name. */
  nothingFound: Array<{ slug: TeamSlug; name: string; href: string }>;
  /** Schools with no varsity roster rows to match against (MaxPreps lists none, or none was read yet), by name. */
  noRoster: Array<{ slug: TeamSlug; name: string; href: string }>;
}

export interface RecruitingRegion {
  id: RegionId;
  /** "Northern California" */
  name: string;
  /** The region's one-sentence count, at the top of its block. */
  summary: string;
  leagues: RecruitingLeague[];
}

export interface RecruitingCounts {
  /** Distinct listed players. */
  players: number;
  /** Schools with at least one listed player. */
  schools: number;
  committed: number;
  /** Tied to any club: current, listed or earlier. */
  withClub: number;
  withProfile: number;
}

export interface RecruitingView {
  lede: string;
  regions: RecruitingRegion[];
  /** The tracked rosters: rosters.json's teams. */
  trackedTeams: number;
  counts: RecruitingCounts;
  /** When each kind of data was researched: "Oct 6, 2026". */
  profilesCheckedOn: string;
  clubsCheckedOn: string;
  commitsCheckedOn: string;
}

function recruitingRow(row: RosterRow): RecruitingRow {
  return {
    key: row.key,
    name: row.name,
    facts: row.facts.map((f) => f.text),
    commitment: row.commitment,
    clubs: row.clubs,
    profiles: row.profiles,
  };
}

const hasAny = (row: RosterRow) => row.commitment !== null || row.clubs.length > 0 || row.profiles.length > 0;

function countRows(rows: readonly RecruitingRow[]): Omit<RecruitingCounts, 'schools' | 'players'> & { players: number } {
  return {
    players: rows.length,
    committed: rows.filter((r) => r.commitment !== null).length,
    withClub: rows.filter((r) => r.clubs.length > 0).length,
    withProfile: rows.filter((r) => r.profiles.length > 0).length,
  };
}

/** "3 players · 1 committed · 2 with a club · 3 with a profile": the zero counts left out. */
export function schoolMeta(rows: readonly RecruitingRow[]): string {
  const c = countRows(rows);
  return [
    plural(c.players, 'player'),
    c.committed > 0 ? `${c.committed} committed` : null,
    c.withClub > 0 ? `${c.withClub} with a club` : null,
    c.withProfile > 0 ? `${c.withProfile} with a profile` : null,
  ]
    .filter((p): p is string => p !== null)
    .join(' · ');
}

/**
 * A count sentence's breakdown: "16 have committed to a college, 80 are tied to a club and 112
 * have a recruiting profile", the zero counts left out.
 */
function breakdownWords(c: Pick<RecruitingCounts, 'committed' | 'withClub' | 'withProfile'>): string {
  const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);
  return listWords(
    [
      c.committed > 0 ? `${c.committed} ${verb(c.committed, 'has', 'have')} committed to a college` : null,
      c.withClub > 0 ? `${c.withClub} ${verb(c.withClub, 'is', 'are')} tied to a club` : null,
      c.withProfile > 0 ? `${c.withProfile} ${verb(c.withProfile, 'has', 'have')} a recruiting profile` : null,
    ].filter((p): p is string => p !== null),
  );
}

/**
 * A region's sentence: "Northern California: 130 players at 30 of the 49 schools. Of them, 16 have
 * committed to a college, …". With nobody listed, it says so.
 */
export function regionSummary(name: string, c: RecruitingCounts, schoolsInRegion: number): string {
  if (c.players === 0) return `${name}: no player on these ${schoolsInRegion} schools’ rosters is listed yet.`;
  return `${name}: ${plural(c.players, 'player')} at ${c.schools} of the ${plural(schoolsInRegion, 'school')}. Of them, ${breakdownWords(c)}.`;
}

/** The page's one-paragraph answer: what it gathers, then how many, and of what kind. */
export function ledeWords(trackedTeams: number, c: RecruitingCounts): string {
  const opening = `Every player on this site’s ${trackedTeams} varsity rosters with a recruiting profile, a youth club or a college commitment that a public page shows, school by school.`;
  if (c.players === 0) return `${opening} No public page we found shows one for a player here yet.`;
  return `${opening} ${plural(c.players, 'player')} from ${plural(c.schools, 'school')} ${c.players === 1 ? 'is' : 'are'} listed: ${breakdownWords(c)}.`;
}

/** `/recruiting`: region → league → school, each school's listed players in the roster's order. */
export function buildRecruitingView(): RecruitingView {
  const trackedTeams = getRosters().teams.length;
  const all: RecruitingRow[] = [];
  const schoolsWithRows = new Set<string>();

  const regions: RecruitingRegion[] = REGIONS.map((region) => {
    const regionRows: RecruitingRow[] = [];
    let regionSchools = 0;
    let regionTeams = 0;
    const leagues: RecruitingLeague[] = getTeamsGrouped(region.id).flatMap(({ leagues: ls }) =>
      ls.map(({ league, divisions }) => {
        const teams = divisions
          .flatMap((d) => d.teams)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        regionTeams += teams.length;
        const schools: RecruitingSchool[] = [];
        const nothingFound: RecruitingLeague['nothingFound'] = [];
        const noRoster: RecruitingLeague['noRoster'] = [];
        for (const team of teams) {
          const roster = buildRosterView(team.slug);
          const href = `/teams/${team.slug}#roster`;
          const rows = (roster?.rows ?? []).filter(hasAny).map(recruitingRow);
          if (rows.length > 0) {
            schools.push({ slug: team.slug, id: team.slug, name: team.name, href, meta: schoolMeta(rows), rows });
            schoolsWithRows.add(team.slug);
            regionRows.push(...rows);
            all.push(...rows);
          } else if (roster === null || roster.rows.length === 0) {
            noRoster.push({ slug: team.slug, name: team.name, href });
          } else {
            nothingFound.push({ slug: team.slug, name: team.name, href });
          }
        }
        regionSchools += schools.length;
        const players = schools.reduce((n, s) => n + s.rows.length, 0);
        return {
          id: league.id,
          title: leagueTitle(league),
          meta:
            players === 0
              ? plural(teams.length, 'school')
              : `${plural(players, 'player')} at ${schools.length} of ${plural(teams.length, 'school')}`,
          membershipNote: getLeague(league.id).membershipNote,
          schools,
          nothingFound,
          noRoster,
        };
      }),
    );
    const counts = { ...countRows(regionRows), schools: regionSchools };
    return { id: region.id, name: region.name, summary: regionSummary(region.name, counts, regionTeams), leagues };
  });

  const counts: RecruitingCounts = { ...countRows(all), schools: schoolsWithRows.size };
  return {
    lede: ledeWords(trackedTeams, counts),
    regions,
    trackedTeams,
    counts,
    profilesCheckedOn: dateWithYear(getRosterEnrichment().capturedAt),
    clubsCheckedOn: dateWithYear(getClubsFile().capturedAt),
    commitsCheckedOn: dateWithYear(getCommitsFile().capturedAt),
  };
}

/** /teams' league heading: "SCVAL — Santa Clara Valley Athletic League", a group of independents by its name. */
function leagueTitle(league: LeagueSummary): string {
  return getLeague(league.id).independents === true ? league.name : `${league.shortName} — ${league.name}`;
}
