/**
 * data/soccer/club-rosters.json: a kept copy of the public team rosters of the Northern California girls
 * leagues ECNL runs (ECNL Girls Northern Cal and the ECNL Regional League's NorCal and Golden State
 * conferences), written by `pnpm fetch-club-rosters`, and of Girls Academy teams' GotSport rosters, kept
 * by hand; and the comparison of it with the high school rosters that `pnpm compare-club-rosters`
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
 *   2. the high school row has a grade and the roster row's class year is that grade's;
 *   3. no other tracked school has a row under that name, varsity or JV;
 *   4. every roster row that passes 1 and 2 is at one club;
 *   5. the club has a record in clubs.json and is based where the tracked schools are (LOCAL_REGIONS).
 * A name alone never links: a row with no grade, a roster row with no class year and a class year
 * that disagrees are each reported and left alone. A match is medium confidence on its own (a class
 * year and the club's location, nothing naming the school); it adds a source to a tie other pages
 * already make.
 *
 * Two tiers. A league team whose page gives each player's class year (ECNL's) is compared as above. A
 * Girls Academy team's GotSport roster gives no class year, only the team's birth years ("08/09"); its
 * rows are compared on their own, rule 2 reading "the row's class year is one those birth years can
 * be in" (birthYearClassYears: California's September 1 cutoff puts a 2008 birth in the class of 2026
 * or 2027). Rules 3-5 hold within each tier, so a GA row neither blocks nor is blocked by an ECNL row
 * at another club: a player's ties are per club, each with its own status.
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
/** A team's public roster: its Athlete One team page, or its GotSport Rankings roster page. */
const teamUrl = z
  .string()
  .regex(
    /^https:\/\/(app\.athleteone\.com\/public\/event\/\d+\/|rankings\.gotsport\.com\/teams\/\d+\/roster$)/,
    'expected a team page on app.athleteone.com or a roster on rankings.gotsport.com',
  );
const GOTSPORT_TEAM = /^https:\/\/rankings\.gotsport\.com\//;

export const ClubRosterPlayerSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    /** The class year the team page's data carries; null when it has none. */
    gradYear: z.number().int().min(2020).max(2040).nullable(),
    position: text.nullable(),
    /** The roster's own label: "First Team Player", "Club Player Pool", "Discovery Player", "Guest Player". */
    playerType: text.nullable(),
  })
  .strict();

export const ClubRosterTeamSchema = z
  .object({
    league: slugId,
    /** The age group, as the league names it: "GU17". */
    division: text,
    teamId: z.number().int(),
    teamName: text,
    clubId: z.number().int(),
    clubName: text,
    /** The team's public page: an Athlete One team page (its Roster button lists the players) or a GotSport Rankings roster. */
    url: teamUrl,
    /**
     * The birth years the team is for ([2008, 2009] for "08/09"), on a team whose roster gives no class
     * year (Girls Academy's GotSport rosters); absent on a team whose rows carry one.
     */
    birthYears: z.array(z.number().int().min(2000).max(2030)).min(1).optional(),
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
     * A league club (clubKey: Athlete One's club id, or "gotsport-" and GotSport's) → the club's slug in
     * clubs.json. Hand-kept; a club with no entry is never linked.
     */
    clubSlugs: z.record(z.string().regex(/^(gotsport-)?\d+$/), slugId),
    counts: z
      .object({ teams: z.number().int(), players: z.number().int(), hidden: z.number().int(), tooYoung: z.number().int(), emptyTeams: z.number().int() })
      .strict(),
    teams: z.array(ClubRosterTeamSchema),
  })
  .strict()
  .superRefine((f, ctx) => {
    const leagues = new Set(f.leagues.map((l) => l.id));
    const seen = new Set<string>();
    f.teams.forEach((t, i) => {
      if (!leagues.has(t.league)) ctx.addIssue({ code: 'custom', path: ['teams', i, 'league'], message: `${t.league} is not in leagues[]` });
      const key = `${t.league} ${t.teamId}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['teams', i], message: `duplicate team ${key}` });
      seen.add(key);
      if (GOTSPORT_TEAM.test(t.url) !== (t.birthYears !== undefined)) {
        ctx.addIssue({ code: 'custom', path: ['teams', i, 'birthYears'], message: 'a GotSport roster, and only one, gives the team\'s birth years' });
      }
      if (t.birthYears !== undefined && t.players.some((p) => p.gradYear !== null)) {
        ctx.addIssue({ code: 'custom', path: ['teams', i, 'players'], message: 'a team compared on its birth years keeps no class year' });
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

/** The key clubSlugs maps a team's club by: GotSport's club ids are their own series, apart from Athlete One's. */
export const clubKey = (team: Pick<ClubRosterTeam, 'clubId' | 'url'>): string => (GOTSPORT_TEAM.test(team.url) ? `gotsport-${team.clubId}` : String(team.clubId));

/**
 * The class years a team's birth years admit. California's school-entry cutoff is September 1, so a
 * player born in 2008 is in the class of 2026 (January-August) or 2027 (September-December):
 * [2008, 2009] admits 2026 through 2028.
 */
export function birthYearClassYears(birthYears: readonly number[]): { first: number; last: number } {
  return { first: Math.min(...birthYears) + 18, last: Math.max(...birthYears) + 19 };
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
  /** Rules 1-3 hold, but the agreeing rows are at more than one club. */
  | 'several-clubs'
  /** Rules 1-4 hold, but the club has no record in clubs.json. */
  | 'no-club-record'
  /** Rules 1-4 hold, but the club is based outside LOCAL_REGIONS. */
  | 'club-elsewhere'
  /** Another tracked school has a row under this name. */
  | 'name-at-two-schools'
  /** The high school row has no grade: the name is all there is. */
  | 'no-grade'
  /** No roster row under the name carries a class year. */
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

export interface CompareRow {
  row: SchoolRow;
  tier: CompareTier;
  outcome: CompareOutcome;
  /** For a match (and the outcomes that fail only rule 4 or 5): the roster rows whose class year agrees. Otherwise every row under the name. */
  hits: RosterHit[];
  /** Set for a match only. */
  tie: TieState | null;
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
  const tieOf = (r: SchoolRow, club: string): TieState => {
    if (r.athleteId === null) return 'new';
    const ties = r.level === 'jv' ? (clubs.jvAffiliations ?? []) : clubs.affiliations;
    const tie = ties.find((a) => a.teamSlug === r.teamSlug && a.athleteId === r.athleteId && a.club === club);
    if (!tie) return 'new';
    return tie.sources.some((s) => s.kind === LEAGUE_ROSTER_KIND) ? 'linked' : 'tie-without-roster';
  };
  const agrees = (h: RosterHit, classYear: number): boolean => {
    if (h.team.birthYears === undefined) return h.player.gradYear === classYear;
    const { first, last } = birthYearClassYears(h.team.birthYears);
    return classYear >= first && classYear <= last;
  };

  const out: CompareRow[] = [];
  for (const row of rows) {
    const key = nameKey(row.fullName);
    const named = key === '' ? undefined : byName.get(key);
    if (!named) continue;
    for (const tier of ['class-year', 'birth-years'] as const) {
      const all = named.filter((h) => (h.team.birthYears === undefined ? 'class-year' : 'birth-years') === tier);
      if (all.length === 0) continue;
      const result = (outcome: CompareOutcome, hits: RosterHit[] = all, tie: TieState | null = null) => out.push({ row, tier, outcome, hits, tie });
      if ((schoolsByName.get(key)?.size ?? 0) > 1) {
        result('name-at-two-schools');
        continue;
      }
      const classYear = row.classYear;
      if (classYear === null) {
        result('no-grade');
        continue;
      }
      const agreeing = all.filter((h) => agrees(h, classYear));
      if (agreeing.length === 0) {
        result(all.every((h) => h.team.birthYears === undefined && h.player.gradYear === null) ? 'no-class-year' : 'class-year-differs');
        continue;
      }
      if (new Set(agreeing.map((h) => clubKey(h.team))).size > 1) {
        result('several-clubs', agreeing);
        continue;
      }
      const club = agreeing[0].club;
      const region = club === null ? undefined : regionOf.get(club);
      if (club === null || region === undefined) result('no-club-record', agreeing);
      else if (!LOCAL_REGIONS.includes(region)) result('club-elsewhere', agreeing);
      else result('match', agreeing, tieOf(row, club));
    }
  }
  return out;
}
