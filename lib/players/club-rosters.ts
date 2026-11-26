/**
 * data/soccer/club-rosters.json: a kept copy of the public team rosters of the Northern California girls
 * leagues ECNL runs (ECNL Girls Northern Cal and the ECNL Regional League's NorCal and Golden State
 * conferences), written by `pnpm fetch-club-rosters`, and of Girls Academy teams' GotSport rosters and,
 * where a club keeps them there, their Hudl rosters, kept by hand; and the comparison of it with the high school rosters that `pnpm compare-club-rosters`
 * prints (README, "Club rosters").
 *
 * The copy exists so that a school's roster can be compared the day it is posted, without reading the
 * leagues' pages again. It is never rendered and nothing in the site imports this module: the file
 * names players who are on no tracked roster. Pure: the contract and the comparison take their inputs
 * as arguments, and the script reads the files.
 *
 * The league-roster rule (a narrower case of the clubs' linking rule, README "Clubs"): a roster row
 * and a high school row are the same player when
 *   1. the names are the same once folded (lib/players/name-compare.ts nameKey), first name then last;
 *   2. the roster row's class year is the high school row's: the one its grade gives, else (a row with
 *      no grade; loosened 2026-11-25) the one class year the player's own linked recruiting pages state,
 *      else, on a team whose rows carry a class year, the roster's own, when every row under the name that
 *      gives one gives the same year and it is a class in high school this season (`classYearFromRoster`);
 *      A roster row with no class year agrees when the team's name gives its birth years ("G2010/11") and
 *      they admit the row's class year, as a Girls Academy row's do (below; added 2026-11-26);
 *   3. no other tracked school has a row under that name, varsity or JV;
 *   4. every roster row that passes 1 and 2 is at one club, or, when they are at several, exactly one of
 *      those clubs is one a page other than a league roster already ties the row to (in the class-year
 *      tier only: a GotSport roster is undated): the match is then
 *      that club's, and the other clubs' rows are set aside (`setAside`), never linked (added 2026-11-26:
 *      a player a club has moved from can stay on its rosters, as Vivian Baker of Mitty stays on MVLA's
 *      with the same league account as on Bay Area Surf's, the club her other pages name);
 *   5. the club has a record in clubs.json and is based where the tracked schools are (LOCAL_REGIONS).
 * A name alone never links: a row with no grade whose name's roster rows give no class year (or two),
 * a roster row with no class year on a team whose name gives no birth years, and a class year that
 * disagrees are each reported and left alone. A
 * match is medium confidence on its own (a class year and the club's location, nothing naming the
 * school); it adds a source to a tie other pages already make. A match on a row with no grade says
 * where its class year came from (`classYearFrom`): MaxPreps posts no grade for whole schools (Los
 * Gatos, 2026-11-25), and the rule took none of their players while it asked for one.
 *
 * Two tiers. A league team whose page gives each player's class year (ECNL's) is compared as above. A
 * Girls Academy team's GotSport roster gives no class year, only the team's birth years ("08/09"); its
 * rows are compared on their own, rule 2 reading "the row's class year is one those birth years can
 * be in" (birthYearsAdmit: California's September 1 cutoff puts a 2008 birth in the class of 2026
 * or 2027). Rules 3-5 hold within each tier, so a GA row neither blocks nor is blocked by an ECNL row
 * at another club: a player's ties are per club, each with its own status.
 *
 * Hudl (added 2026-11-26). A club that keeps its GA teams on Hudl (Almaden FC) has a roster there for
 * the season ("2026-2027"), listing the players this season's team carries, most with a class year,
 * where GotSport Rankings lists everyone a team has carried. Such a team is kept from Hudl and compared
 * in the class-year tier, as an ECNL team is: a row with a class year on it, a row with none on the
 * team's birth years (`birthYears`, the GA age group's). The GotSport roster of the same team is kept
 * with `supersededBy` naming the Hudl page and is no longer compared: a tie still citing it is one the
 * season's roster does not confirm.
 */

import { z } from 'zod';

import { slugId } from '../schema-primitives';
import type { ClubRegion, ClubsFile } from './clubs-schema';
import { nameKey } from './name-compare';

/** The kind an affiliation source built from the kept copy carries (lib/players/clubs-schema.ts CLUB_SOURCE_KINDS). */
export const LEAGUE_ROSTER_KIND = 'league-roster';

/** Where the tracked soccer schools are: a club based in one of these is near enough for a class year to link. */
export const LOCAL_REGIONS: readonly ClubRegion[] = ['san-francisco', 'peninsula', 'south-bay', 'central-coast'];

const text = z.string().min(1);
/** A league's public page: Athlete One's for ECNL, GotSport's event page for Girls Academy. */
const leagueUrl = z
  .string()
  .regex(
    /^https:\/\/(app\.athleteone\.com\/public\/event\/\d+\/|system\.gotsport\.com\/org_event\/events\/\d+$)/,
    'expected a league page on app.athleteone.com or system.gotsport.com',
  );
/** A team's public roster: its Athlete One team page, its GotSport Rankings roster page, or its Hudl roster page. */
const teamUrl = z
  .string()
  .regex(
    /^https:\/\/(app\.athleteone\.com\/public\/event\/\d+\/|rankings\.gotsport\.com\/teams\/\d+\/roster$|fan\.hudl\.com\/[a-z0-9/-]+\/team\/\d+\/[a-z0-9-]+\/roster$)/,
    'expected a team page on app.athleteone.com, a roster on rankings.gotsport.com or a team roster on fan.hudl.com',
  );
const GOTSPORT_TEAM = /^https:\/\/rankings\.gotsport\.com\//;
const HUDL_TEAM = /^https:\/\/fan\.hudl\.com\//;

/** Where a kept team's roster was read: the source decides its tier and its club key. */
export type RosterSource = 'athleteone' | 'gotsport' | 'hudl';
export const rosterSource = (team: Pick<ClubRosterTeam, 'url'>): RosterSource =>
  GOTSPORT_TEAM.test(team.url) ? 'gotsport' : HUDL_TEAM.test(team.url) ? 'hudl' : 'athleteone';

export const ClubRosterPlayerSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    /** The class year the team page's data carries (Hudl's "Class of"); null when it has none. */
    gradYear: z.number().int().min(2020).max(2040).nullable(),
    position: text.nullable(),
    /** The roster's own label: "First Team Player", "Club Player Pool", "Discovery Player", "Guest Player". */
    playerType: text.nullable(),
  })
  .strict();

export const ClubRosterTeamSchema = z
  .object({
    league: slugId,
    /** The age group, as the league names it: "GU17" (on a Hudl team, the GA age group it plays in). */
    division: text,
    teamId: z.number().int(),
    teamName: text,
    clubId: z.number().int(),
    clubName: text,
    /** The team's public page: an Athlete One team page (its Roster button lists the players) or a GotSport Rankings roster. */
    url: teamUrl,
    /**
     * The birth years the team is for ([2008, 2009] for "08/09"): on a GotSport roster, which gives no
     * class year, and on a Hudl GA team, whose name gives none ("AFC U17 GA"), for its rows with no class
     * year; absent on an Athlete One team (its rows carry one, or its name gives the birth years).
     */
    birthYears: z.array(z.number().int().min(2000).max(2030)).min(1).optional(),
    /**
     * On a GotSport roster only: the Hudl roster of the same team, kept in this file, which replaces it in
     * the comparison (the season's roster, where Rankings lists everyone the team has carried).
     */
    supersededBy: teamUrl.optional(),
    /** Players the team hides from its public roster: counted, never kept. */
    hidden: z.number().int().min(0),
    /** Players too young to be in high school this season: counted, never kept. */
    tooYoung: z.number().int().min(0),
    players: z.array(ClubRosterPlayerSchema),
  })
  .strict();

export const ClubRostersFileSchema = z
  .object({
    builtBy: text,
    fetchedAt: z.string().datetime(),
    /** The high school season the copy is for ("26-27"): the class years kept are that season's. */
    season: z.string().regex(/^\d{2}-\d{2}$/),
    notes: z.array(text),
    leagues: z.array(z.object({ id: slugId, name: text, eventId: z.number().int(), url: leagueUrl }).strict()).min(1),
    /**
     * A league club (clubKey: Athlete One's club id, or "gotsport-" and GotSport's, or "hudl-" and Hudl's
     * organization id) → the club's slug in clubs.json. Hand-kept; a club with no entry is never linked.
     */
    clubSlugs: z.record(z.string().regex(/^(gotsport-|hudl-)?\d+$/), slugId),
    counts: z
      .object({ teams: z.number().int(), players: z.number().int(), hidden: z.number().int(), tooYoung: z.number().int(), emptyTeams: z.number().int() })
      .strict(),
    teams: z.array(ClubRosterTeamSchema),
  })
  .strict()
  .superRefine((f, ctx) => {
    const leagues = new Set(f.leagues.map((l) => l.id));
    const seen = new Set<string>();
    const urls = new Map(f.teams.map((t) => [t.url, t]));
    f.teams.forEach((t, i) => {
      if (!leagues.has(t.league)) ctx.addIssue({ code: 'custom', path: ['teams', i, 'league'], message: `${t.league} is not in leagues[]` });
      const key = `${rosterSource(t)} ${t.league} ${t.teamId}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['teams', i], message: `duplicate team ${key}` });
      seen.add(key);
      const source = rosterSource(t);
      if ((source !== 'athleteone') !== (t.birthYears !== undefined)) {
        ctx.addIssue({ code: 'custom', path: ['teams', i, 'birthYears'], message: 'a GotSport or Hudl roster, and only one, gives the team\'s birth years' });
      }
      if (source === 'gotsport' && t.players.some((p) => p.gradYear !== null)) {
        ctx.addIssue({ code: 'custom', path: ['teams', i, 'players'], message: 'a team compared on its birth years keeps no class year' });
      }
      if (t.supersededBy !== undefined) {
        const by = urls.get(t.supersededBy);
        if (source !== 'gotsport' || by === undefined || rosterSource(by) !== 'hudl' || by.league !== t.league) {
          ctx.addIssue({ code: 'custom', path: ['teams', i, 'supersededBy'], message: 'only a GotSport roster is superseded, and by a Hudl roster of the same league in this file' });
        }
      }
    });
    const players = f.teams.reduce((n, t) => n + t.players.length, 0);
    if (f.counts.teams !== f.teams.length || f.counts.players !== players) {
      ctx.addIssue({ code: 'custom', path: ['counts'], message: 'counts disagree with teams[]' });
    }
  });

export type ClubRosterPlayer = z.infer<typeof ClubRosterPlayerSchema>;
export type ClubRosterTeam = z.infer<typeof ClubRosterTeamSchema>;
export type ClubRostersFile = z.infer<typeof ClubRostersFileSchema>;

/** The key clubSlugs maps a team's club by: GotSport's and Hudl's club ids are their own series, apart from Athlete One's. */
export const clubKey = (team: Pick<ClubRosterTeam, 'clubId' | 'url'>): string => {
  const source = rosterSource(team);
  return source === 'athleteone' ? String(team.clubId) : `${source}-${team.clubId}`;
};

/**
 * The tier a team's rows are compared in: a GotSport roster's on the team's birth years alone, every
 * other's (ECNL's, Hudl's) on the class year a row carries, else the team's birth years.
 */
export const teamTier = (team: Pick<ClubRosterTeam, 'url'>): CompareTier => (rosterSource(team) === 'gotsport' ? 'birth-years' : 'class-year');

/**
 * The class years a team's birth years admit. California's school-entry cutoff is September 1, so a
 * player born in 2008 is in the class of 2026 (January-August) or 2027 (September-December):
 * [2008, 2009] admits 2026 through 2028.
 */
export function birthYearClassYears(birthYears: readonly number[]): { first: number; last: number } {
  return { first: Math.min(...birthYears) + 18, last: Math.max(...birthYears) + 19 };
}

/**
 * Whether a class year is one of a team's birth years can be in: some listed year is the class year
 * less 18 or less 19 (the September 1 cutoff). Each year is checked on its own, so a team listed
 * [2008, 2011] admits 2026, 2027, 2029 and 2030 and not 2028, which no listed year gives.
 */
export function birthYearsAdmit(birthYears: readonly number[], classYear: number): boolean {
  return birthYears.some((y) => classYear - y === 18 || classYear - y === 19);
}

// ---------------------------------------------------------------- the comparison

/** A high school roster row, as the comparison needs it. */
export interface SchoolRow {
  level: 'varsity' | 'jv';
  teamSlug: string;
  /** MaxPreps' athlete id; null on a row that has none (such a row is never tied in clubs.json). */
  athleteId: string | null;
  fullName: string;
  /** The class year the row's grade gives; null for a row with no grade. */
  classYear: number | null;
  /**
   * The class years the player's own linked recruiting pages state (the roster overlay's and the JV
   * list's `profiles[].classOf`). A row with no grade takes its class year from them when they agree;
   * on any row, one that disagrees with the class year compared on rules the match out.
   */
  statedClassYears?: readonly number[];
}

/** One roster row under a high school row's name. */
export interface RosterHit {
  team: ClubRosterTeam;
  player: ClubRosterPlayer;
  /** The club's slug in clubs.json, when clubSlugs maps it. */
  club: string | null;
}

export type CompareOutcome =
  /** Passes the league-roster rule. */
  | 'match'
  /** Rules 1-3 hold, but the agreeing rows are at more than one club, and other pages do not pick one of them out. */
  | 'several-clubs'
  /** Rules 1-4 hold, but the club has no record in clubs.json. */
  | 'no-club-record'
  /** Rules 1-4 hold, but the club is based outside LOCAL_REGIONS. */
  | 'club-elsewhere'
  /** Another tracked school has a row under this name. */
  | 'name-at-two-schools'
  /**
   * The high school row has no grade and nothing else gives its class year: no linked page states one,
   * and the roster rows under the name give none, two different ones, or one no high school player has
   * this season. The name is all there is.
   */
  | 'no-grade'
  /** No roster row under the name carries a class year, nor is on a team whose name gives its birth years. */
  | 'no-class-year'
  /** Every class year under the name disagrees with the row's. */
  | 'class-year-differs';

/** How a match stands in clubs.json. */
export type TieState =
  /** The tie is there and cites this roster. */
  | 'linked'
  /** The tie is there on other pages; the roster is not cited. */
  | 'tie-without-roster'
  /** No tie to this club yet. */
  | 'new';

/**
 * Which roster rows an outcome rests on: those that give each player's class year, or those that give
 * only the team's birth years (Girls Academy's). Each tier is judged on its own (see the header).
 */
export type CompareTier = 'class-year' | 'birth-years';

/** Where the class year a row was compared on came from: its grade, its own linked pages, or the roster (a row with no grade). */
export type ClassYearFrom = 'grade' | 'profile' | 'roster';

export interface CompareRow {
  row: SchoolRow;
  tier: CompareTier;
  outcome: CompareOutcome;
  /** The class year compared on, and where it came from; null when there was none (no-grade, name-at-two-schools). */
  classYear: number | null;
  classYearFrom: ClassYearFrom | null;
  /** For a match (and the outcomes that fail only rule 4 or 5): the roster rows whose class year agrees. Otherwise every row under the name. */
  hits: RosterHit[];
  /** Set for a match only. */
  tie: TieState | null;
  /**
   * For a match rule 4 resolved by another page's tie: the agreeing rows at the other clubs, which the
   * match leaves unlinked. Empty otherwise.
   */
  setAside: RosterHit[];
}

/** The class years in high school during a season: "26-27" is 2027 (seniors) through 2030 (freshmen). */
export function seasonClassYears(season: string): { first: number; last: number } {
  const m = /^(\d{2})-(\d{2})$/.exec(season);
  if (!m) throw new Error(`lib/players/club-rosters.ts: cannot read season "${season}"`);
  const first = 2000 + Number(m[2]);
  return { first, last: first + 3 };
}

/**
 * The class year a row with no grade takes from a team tier's roster rows (rule 2's last case): the one
 * year every row under the name that gives a class year gives, when it is a class in high school this
 * season; null when the rows give none or two. A year out of season is returned too, so the caller can
 * report it as disagreeing (a class of 2026 on a 2026-27 high school roster).
 */
export function classYearFromRoster(hits: readonly RosterHit[]): number | null {
  const years = new Set(hits.filter((h) => teamTier(h.team) === 'class-year' && h.player.gradYear !== null).map((h) => h.player.gradYear!));
  return years.size === 1 ? [...years][0] : null;
}

/**
 * The birth years an ECNL team's name gives: "Bay Area Surf ECNL G2009/10" is [2009, 2010], "Union FC ECNL
 * RL G 2008/09" and "Diablo Valley Futbol Club ECNL RL G07/08" read the same way, and a single year
 * ("G2012") is [2012]; null when the name gives none.
 */
export function birthYearsFromTeamName(teamName: string): number[] | null {
  const m = /\bG ?((?:20)?\d{2})(?:\/(\d{2}))?\b/.exec(teamName);
  if (!m) return null;
  const first = Number(m[1].length === 2 ? `20${m[1]}` : m[1]);
  if (m[2] === undefined) return [first];
  const second = 2000 + Number(m[2]);
  return second === first + 1 ? [first, second] : null;
}

/** "Delaney Kumer": the roster's two fields as one name. */
export const rosterName = (p: Pick<ClubRosterPlayer, 'firstName' | 'lastName'>): string => `${p.firstName} ${p.lastName}`.trim();

/**
 * Every high school row a roster row shares a name with, and what the league-roster rule makes of it
 * (see the header): one entry per row and tier that has a roster row under the name. `clubs` is the
 * clubs file the ties are read from: a varsity row's in `affiliations`, a JV row's in `jvAffiliations`.
 */
export function compareClubRosters(
  file: ClubRostersFile,
  rows: readonly SchoolRow[],
  clubs: Pick<ClubsFile, 'clubs' | 'affiliations'> & Partial<Pick<ClubsFile, 'jvAffiliations'>>,
): CompareRow[] {
  const byName = new Map<string, RosterHit[]>();
  for (const team of file.teams) {
    if (team.supersededBy !== undefined) continue; // its Hudl roster is compared instead
    const club = file.clubSlugs[clubKey(team)] ?? null;
    for (const player of team.players) {
      const key = nameKey(rosterName(player));
      if (key === '') continue;
      byName.set(key, [...(byName.get(key) ?? []), { team, player, club }]);
    }
  }
  const schoolsByName = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = nameKey(r.fullName);
    schoolsByName.set(key, (schoolsByName.get(key) ?? new Set()).add(r.teamSlug));
  }
  const regionOf = new Map(clubs.clubs.map((c) => [c.slug, c.region]));
  // 'linked' only when the tie cites one of the rosters this match rests on: a tie citing a club's ECNL
  // roster does not make its GA match linked, nor the other way round.
  const tiesOf = (r: SchoolRow) =>
    r.athleteId === null
      ? []
      : (r.level === 'jv' ? (clubs.jvAffiliations ?? []) : clubs.affiliations).filter((a) => a.teamSlug === r.teamSlug && a.athleteId === r.athleteId);
  const tieOf = (r: SchoolRow, club: string, agreeing: readonly RosterHit[]): TieState => {
    const tie = tiesOf(r).find((a) => a.club === club);
    if (!tie) return 'new';
    const pages = new Set(agreeing.map((h) => h.team.url));
    return tie.sources.some((s) => s.kind === LEAGUE_ROSTER_KIND && pages.has(s.url)) ? 'linked' : 'tie-without-roster';
  };
  // A team's birth years: a GotSport team's own; for a row with no class year on another team, the team's
  // own (Hudl's) or its name's (ECNL's).
  const birthYearsOf = (h: RosterHit): readonly number[] | null =>
    teamTier(h.team) === 'birth-years'
      ? h.team.birthYears!
      : h.player.gradYear === null
        ? (h.team.birthYears ?? birthYearsFromTeamName(h.team.teamName))
        : null;
  const agrees = (h: RosterHit, classYear: number): boolean => {
    if (teamTier(h.team) === 'class-year' && h.player.gradYear !== null) return h.player.gradYear === classYear;
    const years = birthYearsOf(h);
    return years !== null && birthYearsAdmit(years, classYear);
  };
  // Rule 4 counts clubs as clubs.json does: hits mapped to one record are one club whatever their league
  // ids; an unmapped hit is its own club, by its league key, so two unknown clubs still count as two.
  const clubOf = (h: RosterHit): string => (h.club !== null ? `slug:${h.club}` : `key:${clubKey(h.team)}`);

  const season = seasonClassYears(file.season);
  const out: CompareRow[] = [];
  for (const row of rows) {
    const key = nameKey(row.fullName);
    const named = key === '' ? undefined : byName.get(key);
    if (!named) continue;
    for (const tier of ['class-year', 'birth-years'] as const) {
      const all = named.filter((h) => teamTier(h.team) === tier);
      if (all.length === 0) continue;
      let classYear: number | null = null;
      let classYearFrom: ClassYearFrom | null = null;
      const result = (outcome: CompareOutcome, hits: RosterHit[] = all, tie: TieState | null = null, setAside: RosterHit[] = []) =>
        out.push({ row, tier, outcome, classYear, classYearFrom, hits, tie, setAside });
      if ((schoolsByName.get(key)?.size ?? 0) > 1) {
        result('name-at-two-schools');
        continue;
      }
      const stated = [...new Set(row.statedClassYears ?? [])];
      if (row.classYear !== null) [classYear, classYearFrom] = [row.classYear, 'grade'];
      else if (stated.length === 1) [classYear, classYearFrom] = [stated[0], 'profile'];
      else if (stated.length === 0 && tier === 'class-year') {
        const fromRoster = classYearFromRoster(all);
        if (fromRoster !== null) [classYear, classYearFrom] = [fromRoster, 'roster'];
      }
      if (classYear === null) {
        result('no-grade');
        continue;
      }
      const year = classYear;
      const inSeason = year >= season.first && year <= season.last;
      if (stated.some((y) => y !== year) || (classYearFrom === 'roster' && !inSeason)) {
        result('class-year-differs');
        continue;
      }
      const agreeing = all.filter((h) => agrees(h, year));
      if (agreeing.length === 0) {
        result(all.every((h) => birthYearsOf(h) === null && h.player.gradYear === null) ? 'no-class-year' : 'class-year-differs');
        continue;
      }
      let kept = agreeing;
      let setAside: RosterHit[] = [];
      if (new Set(agreeing.map(clubOf)).size > 1) {
        // Rule 4's second case: exactly one of the clubs is tied by a page other than a league roster. The
        // class-year tier only: its rosters (ECNL's, Hudl's) are this season's, where a GotSport roster is
        // undated and keeps players a team once carried, so a second club there says nothing about which is
        // current.
        if (tier !== 'class-year') {
          result('several-clubs', agreeing);
          continue;
        }
        const byOtherPage = new Set(
          tiesOf(row)
            .filter((a) => a.sources.some((s) => s.kind !== LEAGUE_ROSTER_KIND))
            .map((a) => `slug:${a.club}`),
        );
        const picked = [...new Set(agreeing.map(clubOf))].filter((c) => byOtherPage.has(c));
        if (picked.length !== 1) {
          result('several-clubs', agreeing);
          continue;
        }
        kept = agreeing.filter((h) => clubOf(h) === picked[0]);
        setAside = agreeing.filter((h) => clubOf(h) !== picked[0]);
      }
      const club = kept[0].club;
      const region = club === null ? undefined : regionOf.get(club);
      if (club === null || region === undefined) result('no-club-record', kept);
      else if (!LOCAL_REGIONS.includes(region)) result('club-elsewhere', kept);
      else result('match', kept, tieOf(row, club, kept), setAside);
    }
  }
  return out;
}
