/**
 * The recruiting page (/recruiting), derived from the team rosters' own rows. Pure, so
 * tests/ui/recruiting-view.test.ts can assert it over the real files.
 *
 * One page for every school's recruiting data: the players' own recruiting profiles (the roster
 * overlay, data/field-hockey/rosters-enrichment.json), the youth clubs a public page ties them to
 * (data/field-hockey/clubs.json) and the college commitments a public page reports (data/field-hockey/commits.json). Each
 * team page already shows the same three lines on its roster; this page gathers them, region →
 * league → school, under the NorCal/SoCal switcher.
 *
 * What it promises, and this module enforces:
 *   - the same rows and the same words as the team pages: every row here is a row of
 *     components/teams/roster-view.ts buildRosterView (the varsity roster's own spelling and order),
 *     so its commitment line, club line and profile links are the ones the school's page shows, with
 *     nothing the data files keep but never render (a quote, a basis, a confidence). After them come
 *     the JV players with a recruiting profile (data/field-hockey/jv-profiles.json), each a row of the team page's
 *     JV roster (components/jv/jv-roster-view.ts), its facts led by "JV", and the JV players a public page ties
 *     to a club (data/<sport>/clubs.json jvAffiliations); a JV row has profile links and a club line, never a
 *     commitment, since commitments are researched for the varsity rosters;
 *   - a player is listed only when one of the three exists for them, and a school or league only
 *     when it has a listed player. A school with none is not named or counted anywhere on the page
 *     (no "nothing found" line, no "of 15 schools"): the page is about who is listed, and recall is
 *     partial, so an absence says nothing about a school or its players. For the same reason no
 *     league's membership note is printed: each names or counts all of its league's schools ("Chico,
 *     Corning, …", "eight Southern Section schools"), and this page has no section heading for one
 *     to qualify (DESIGN §22.5 asks for it under a section or league heading listing all six EAL teams);
 *   - no value here is marked †: a row carries its facts as plain text, and the team page, which
 *     each school's heading links, says where each came from.
 */

import { clubsResearched, getClubsFile } from '../../lib/players/clubs';
import { isResearched } from '../../lib/schema-primitives';
import { getCommitsFile } from '../../lib/players/commits';
import { getJvProfilesFile } from '../../lib/jv/jv-profiles';
import { getTeamsGrouped } from '../../lib/data';
import { dateWithYear, listWords } from '../../lib/format';
import { REGIONS } from '../../lib/league-config/sections';
import { leagueHeading } from '../../lib/leagues';
import { getRosterEnrichment, getRosters } from '../../lib/players/rosters';
import type { RegionId, TeamSlug } from '../../lib/types';
import { buildTeamJvRosterView, type JvRosterRow } from '../jv/jv-roster-view';
import { buildRosterView, type RosterRow } from '../teams/roster-view';
import { plural } from '../words/plural';

/** A roster row with something to show here: its commitment, clubs and profiles, as the team page has them. */
export interface RecruitingRow extends Pick<RosterRow, 'key' | 'name' | 'commitment' | 'clubs' | 'profiles'> {
  /** true for a JV player (listed for a profile or a club); "JV" leads its facts. */
  jv: boolean;
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
  /** "12 players at 5 schools" */
  meta: string;
  /** The schools with a listed player, by name; never empty (a league with none is left out). */
  schools: RecruitingSchool[];
}

export interface RecruitingRegion {
  id: RegionId;
  /** "Northern California" */
  name: string;
  /** The region's one-sentence count, at the top of its block. */
  summary: string;
  /** The leagues with a listed player, in /teams' order. */
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
  /** Of `players`, the JV players listed (each for a profile or a club); 0 when none. */
  jvWithProfile?: number;
  /** Of those, the JV players with a club line; 0 when none. */
  jvWithClub?: number;
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
  /**
   * Whether each file holds research (lib/schema-primitives.ts isResearched): false for a placeholder no round has
   * filled yet, whose date above is the placeholder's and is never printed.
   */
  researched: { profiles: boolean; clubs: boolean; commits: boolean };
}

function recruitingRow(row: RosterRow): RecruitingRow {
  return {
    key: row.key,
    name: row.name,
    jv: false,
    facts: row.facts.map((f) => f.text),
    commitment: row.commitment,
    clubs: row.clubs,
    profiles: row.profiles,
  };
}

/** A JV roster row with a profile or a club: "JV" leads its facts, and it has no commitment line. */
function jvRecruitingRow(row: JvRosterRow): RecruitingRow {
  return {
    key: `jv-${row.key}`,
    name: row.name,
    jv: true,
    facts: ['JV', ...row.facts],
    commitment: null,
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
    jvWithProfile: rows.filter((r) => r.jv).length,
    jvWithClub: rows.filter((r) => r.jv && r.clubs.length > 0).length,
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
 * A region's sentence: "Northern California: 130 players at 30 schools. Of them, 16 have committed
 * to a college, …". It never counts the schools with nobody listed.
 */
export function regionSummary(name: string, c: RecruitingCounts): string {
  if (c.players === 0) return `${name}: no player is listed yet.`;
  return `${name}: ${plural(c.players, 'player')} at ${plural(c.schools, 'school')}. Of them, ${breakdownWords(c)}.`;
}

/** The page's one-paragraph answer: what it gathers, then how many, and of what kind. */
export function ledeWords(trackedTeams: number, c: RecruitingCounts): string {
  const jv = c.jvWithProfile ?? 0;
  const jvWhat = (c.jvWithClub ?? 0) > 0 ? 'a recruiting profile or a youth club' : 'a recruiting profile';
  const opening =
    jv > 0
      ? `Every player on this site’s ${trackedTeams} varsity rosters with a recruiting profile, a youth club or a college commitment that a public page shows, and every JV player with ${jvWhat}, school by school.`
      : `Every player on this site’s ${trackedTeams} varsity rosters with a recruiting profile, a youth club or a college commitment that a public page shows, school by school.`;
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
    const leagues: RecruitingLeague[] = getTeamsGrouped(region.id).flatMap(({ leagues: ls }) =>
      ls.flatMap(({ league, divisions }): RecruitingLeague[] => {
        const teams = divisions
          .flatMap((d) => d.teams)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        const schools: RecruitingSchool[] = [];
        for (const team of teams) {
          const rows = [
            ...(buildRosterView(team.slug)?.rows ?? []).filter(hasAny).map(recruitingRow),
            ...(buildTeamJvRosterView(team.slug)?.rows ?? []).filter((r) => r.profiles.length > 0 || r.clubs.length > 0).map(jvRecruitingRow),
          ];
          if (rows.length === 0) continue;
          const href = `/teams/${team.slug}#roster`;
          schools.push({ slug: team.slug, id: team.slug, name: team.name, href, meta: schoolMeta(rows), rows });
          schoolsWithRows.add(team.slug);
          regionRows.push(...rows);
          all.push(...rows);
        }
        if (schools.length === 0) return [];
        regionSchools += schools.length;
        const players = schools.reduce((n, s) => n + s.rows.length, 0);
        return [
          {
            id: league.id,
            title: leagueHeading(league.id),
            meta: `${plural(players, 'player')} at ${plural(schools.length, 'school')}`,
            schools,
          },
        ];
      }),
    );
    const counts = { ...countRows(regionRows), schools: regionSchools };
    return { id: region.id, name: region.name, summary: regionSummary(region.name, counts), leagues };
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
    researched: {
      profiles: isResearched(
        getRosterEnrichment().notes,
        getRosterEnrichment().teams.reduce((n, t) => n + t.players.reduce((m, p) => m + p.profiles.length, 0), 0),
      ) ||
        // The JV lists' profiles are listed here too: their file holding research is research.
        isResearched(
          getJvProfilesFile().notes,
          getJvProfilesFile().teams.reduce((n, t) => n + t.players.reduce((m, p) => m + p.profiles.length, 0), 0),
        ),
      clubs: clubsResearched(),
      commits: isResearched(getCommitsFile().notes, getCommitsFile().commitments.length),
    },
  };
}
