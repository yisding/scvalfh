import { clubDisplayName, getClubs } from '../../lib/clubs';
import {
  collegeDisplayName,
  commitClassOf,
  commitProgram,
  getCollegeCommitments,
  getColleges,
  getCommitments,
  getCommitsFile,
  getCommittedPlayer,
  getPlayerCommitment,
  type College,
  type CollegeDivision,
  type CollegeProgram,
  type CommitSource,
  type CommitSport,
  type CommitStatus,
  type Commitment,
} from '../../lib/commits';
import { clubSiteKey } from '../../lib/clubs-schema';
import { COLLEGE_DIVISIONS, COMMIT_SPORTS } from '../../lib/commits-schema';
import { dateWithYear, gradeWord, listWords, partialDate } from '../../lib/format';
import { getRosters } from '../../lib/rosters';
import type { TeamSlug } from '../../lib/types';
import { plural } from '../ui/plural';
import { OUTLETS, hostOf, numbered, pathOf, schoolName } from '../ui/source-hosts';

/**
 * The college commitments page (/commits) and the team roster's commitment line (SPEC §1.1j3,
 * DESIGN §21), derived from lib/commits.ts. Pure, so tests/ui/commit-view.test.ts can assert it
 * over the real files; every word the page or a roster line prints about a commitment is chosen
 * here, in one module.
 *
 * What the page promises, and this module enforces (the clubs pages' posture, DESIGN §17.2):
 *   - only rows on the tracked varsity rosters are named: every commitment joined a non-JV row of
 *     data/rosters.json at load (lib/commits.ts), and is shown under that row's own spelling;
 *   - `quote`, `basis`, `confidence`, `statedSchool` and `statedClassYear` never reach a view type:
 *     the quote and the basis are for maintainers and can name people who are not players here;
 *   - a commitment is never worded as more than its sources say: "Committed" unless a source says
 *     the player signed, and the date is "as of" the earliest date a source gives, never called the
 *     day the player decided;
 *   - a commitment in another sport says which: the site is about field hockey, so field hockey
 *     goes without saying on a roster line, and every other sport is named beside the college;
 *   - link labels come from the source kind and the host, never from a URL path — apart from the
 *     page-type tests (`/athlete/`, `/athletes/`, `/athletic-scholarships/`), so a name in a slug is
 *     never printed;
 *   - every row links the pages it rests on, each URL once.
 */

// ---------------------------------------------------------------- wording tables

/** A college team's level in words: "NCAA Division I". The order is COLLEGE_DIVISIONS'. */
export const DIVISION_WORDS: Record<CollegeDivision, string> = {
  'ncaa-d1': 'NCAA Division I',
  'ncaa-d2': 'NCAA Division II',
  'ncaa-d3': 'NCAA Division III',
  naia: 'NAIA',
};

/**
 * A sport in words, lower case, as it reads mid-sentence ("St. Lawrence soccer", "a lacrosse
 * commitment"); sportLabel() capitalizes it to start a line. The order is COMMIT_SPORTS'.
 */
export const SPORT_WORDS: Record<CommitSport, string> = {
  'field-hockey': 'field hockey',
  lacrosse: 'lacrosse',
  soccer: 'soccer',
  basketball: 'basketball',
  volleyball: 'volleyball',
  'beach-volleyball': 'beach volleyball',
  softball: 'softball',
  'track-and-field': 'track and field',
  'cross-country': 'cross country',
  'swimming-and-diving': 'swimming and diving',
  'water-polo': 'water polo',
  rowing: 'rowing',
  golf: 'golf',
  tennis: 'tennis',
  'ice-hockey': 'ice hockey',
  gymnastics: 'gymnastics',
  equestrian: 'equestrian',
  'acrobatics-and-tumbling': 'acrobatics and tumbling',
  stunt: 'stunt',
  'competitive-cheer': 'competitive cheer',
  'competitive-dance': 'competitive dance',
  'flag-football': 'flag football',
  rugby: 'rugby',
  wrestling: 'wrestling',
  fencing: 'fencing',
  bowling: 'bowling',
  triathlon: 'triathlon',
  rifle: 'rifle',
  skiing: 'skiing',
  squash: 'squash',
  sailing: 'sailing',
  baseball: 'baseball',
  football: 'football',
};

/** "Field hockey", "Lacrosse": a sport at the start of a line. */
export function sportLabel(sport: CommitSport): string {
  const words = SPORT_WORDS[sport];
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Clubs in other sports whose own sites a commitment cites (a lacrosse club's commitments page).
 * They are not field hockey clubs, so data/clubs.json does not hold them.
 */
const OTHER_CLUBS: Readonly<Record<string, string>> = {
  'stepscalifornia.com': 'STEPS California',
  'advnclacrosse.com': 'ADVNC Lacrosse',
};

/** The recruiting platforms' profile links. */
const PLATFORM_LABELS = {
  ncsa: 'NCSA profile',
  hudl: 'Hudl profile',
  fieldlevel: 'FieldLevel profile',
} as const;

/** Which club's own site a URL is on: every club of data/clubs.json with a website, by clubSiteKey (a host, or a site on a shared host). */
const CLUB_BY_SITE: ReadonlyMap<string, string> = new Map(
  getClubs().flatMap((c) => (c.website ? [[clubSiteKey(c.website), clubDisplayName(c)] as const] : [])),
);

/**
 * A source's link text: "SportsRecruits profile", "SportsRecruits college page", "NCSA profile",
 * "MaxPreps profile", "Stanford athletics", "SF Hawks site", "Stick Together", "The Talon", or the
 * bare host when nothing better is known.
 */
export function sourceLabel(src: Pick<CommitSource, 'url' | 'kind'>, college: College): string {
  const host = hostOf(src.url);
  switch (src.kind) {
    case 'sportsrecruits': {
      const path = pathOf(src.url);
      if (path.includes('/athlete/')) return 'SportsRecruits profile';
      // A college's recruiting page, which lists its committed athletes.
      return path.includes('/athletic-scholarships/') ? 'SportsRecruits college page' : 'SportsRecruits page';
    }
    case 'ncsa':
    case 'hudl':
    case 'fieldlevel':
      return PLATFORM_LABELS[src.kind];
    case 'maxpreps':
      return pathOf(src.url).includes('/athletes/') ? 'MaxPreps profile' : 'MaxPreps page';
    case 'college':
      return college.programs.some((p) => p.url !== null && hostOf(p.url) === host)
        ? `${collegeDisplayName(college)} athletics`
        : host;
    case 'club-site': {
      const club = CLUB_BY_SITE.get(clubSiteKey(src.url)) ?? OTHER_CLUBS[host];
      return club ? `${club} site` : host;
    }
    default:
      return OUTLETS[host]?.label ?? host;
  }
}

/**
 * A commitment's status in words (DESIGN §21.3):
 *
 *   asOf          committed                    signed
 *   day           Committed, as of Jun 15, 2026  Signed, as of Nov 12, 2026
 *   month         Committed, as of Jun 2026      Signed, as of Nov 2026
 *   year          Committed, as of 2026          Signed, as of 2026
 *   none          Committed                      Signed
 *
 * "As of": the date is the earliest a source gives, which may be the page's date, not the day the
 * player decided.
 */
export function statusWords(c: Pick<Commitment, 'status' | 'asOf'>): string {
  const word = c.status === 'signed' ? 'Signed' : 'Committed';
  return c.asOf === null ? word : `${word}, as of ${partialDate(c.asOf)}`;
}

/** "Stanford, CA" */
function placeWords(college: College): string {
  return `${college.city}, ${college.state}`;
}

/** The id of a commitment's row on /commits: the team slug and the MaxPreps athleteId, never a name. */
export function commitAnchor(c: Pick<Commitment, 'teamSlug' | 'athleteId'>): string {
  return `${c.teamSlug}-${c.athleteId}`;
}

/** The id of a college's row on /commits. */
export function collegeAnchor(slug: string): string {
  return `college-${slug}`;
}

// ---------------------------------------------------------------- the team roster's line

/**
 * A roster row's commitment line: "Committed: Stanford", or, in another sport, "Committed: St.
 * Lawrence (soccer)", linking the player's row on /commits.
 */
export interface RosterCommitLine {
  status: CommitStatus;
  label: 'Committed' | 'Signed';
  /**
   * The same words for the link's accessible name: "Pat Example’s college commitment: Stanford", or
   * "Pat Example’s college soccer commitment: St. Lawrence".
   */
  srLabel: string;
  college: { slug: string; name: string; href: string };
  /** The sport in words when it is not field hockey ("soccer"), shown after the college; else null. */
  sport: string | null;
}

/** null for a row without a MaxPreps athleteId or a player no source says has committed — most rows. */
export function playerCommitLine(teamSlug: TeamSlug, athleteId: string | null): RosterCommitLine | null {
  if (athleteId === null) return null;
  const c = getPlayerCommitment(teamSlug, athleteId);
  if (c === null) return null;
  const { college } = commitProgram(c);
  const sport = c.sport === 'field-hockey' ? null : SPORT_WORDS[c.sport];
  const what = c.status === 'signed' ? 'signing' : 'commitment';
  return {
    status: c.status,
    label: c.status === 'signed' ? 'Signed' : 'Committed',
    srLabel: sport === null ? `college ${what}` : `college ${sport} ${what}`,
    college: { slug: college.slug, name: collegeDisplayName(college), href: `/commits#${commitAnchor(c)}` },
    sport,
  };
}

// ---------------------------------------------------------------- /commits

export interface CommitSourceLink {
  label: string;
  url: string;
}

export interface CommitRow {
  key: string;
  /** commitAnchor(): the row's id, which the roster line links. */
  anchor: string;
  /** The roster row's own spelling. */
  name: string;
  /** The registry name, and `/teams/<slug>#roster`. */
  school: { name: string; href: string };
  /** The grade in words, when the roster has one. */
  facts: string[];
  college: {
    /** The display name: "Stanford". */
    name: string;
    /** The official name, only when the display name is a short one. */
    fullName: string | null;
    /** The sport, capitalized: "Field hockey", "Lacrosse". */
    sport: string;
    /** The level of the college's team in that sport: "NCAA Division I". */
    division: string;
  };
  /** statusWords(): "Committed, as of Jun 2026". */
  status: string;
  statusKind: CommitStatus;
  /** Every page the commitment rests on, each URL once, in the file's order. */
  sources: CommitSourceLink[];
}

export interface CommitClassGroup {
  /** `class-2027`; `class-unknown` for players whose class year nobody published. */
  id: string;
  /** "Class of 2027", "Class year not listed". */
  heading: string;
  /** "5 players" */
  meta: string;
  rows: CommitRow[];
}

/** One of a college's teams on /commits: the sport, its level and conference, and its page. */
export interface CollegeProgramRow {
  sport: CommitSport;
  /** The sport, the division and the conference when known: ["Field hockey", "NCAA Division I", "ACC"]. */
  facts: string[];
  /** This sport's page on the college's own site ("Stanford field hockey"), when the record has one. */
  link: CommitSourceLink | null;
}

export interface CollegeRow {
  slug: string;
  /** collegeAnchor() */
  anchor: string;
  /** The display name. */
  name: string;
  /** The official name, only when the display name is a short one. */
  fullName: string | null;
  /** "Stanford, CA" */
  place: string;
  /** The teams players here committed to, in the file's order (field hockey first). */
  programs: CollegeProgramRow[];
  /** "2 players", "1 player". */
  countLine: string;
  /** The committed players' schools, by registry name, distinct and alphabetical. */
  schools: string[];
}

export interface CommitsView {
  lede: string;
  /** The earliest class first; [] when no commitment is in the file. */
  classes: CommitClassGroup[];
  /** lib/commits.ts getColleges() order: the most players first. */
  colleges: CollegeRow[];
  /** The tracked rosters: rosters.json's teams, 49 today. */
  trackedTeams: number;
  playerCount: number;
  schoolCount: number;
  collegeCount: number;
  /** "Oct 3, 2026": when the research was done. */
  capturedOn: string;
}

function commitRow(c: Commitment): CommitRow {
  const row = getCommittedPlayer(c);
  const { college, program } = commitProgram(c);
  const seen = new Set<string>();
  const sources = c.sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  return {
    key: commitAnchor(c),
    anchor: commitAnchor(c),
    name: row.fullName,
    school: { name: schoolName(c.teamSlug), href: `/teams/${c.teamSlug}#roster` },
    facts: row.grade !== null ? [gradeWord(row.grade)] : [],
    college: {
      name: collegeDisplayName(college),
      fullName: college.shortName !== null ? college.name : null,
      sport: sportLabel(c.sport),
      division: DIVISION_WORDS[program.division],
    },
    status: statusWords(c),
    statusKind: c.status,
    sources: numbered(sources.map((s) => ({ label: sourceLabel(s, college), url: s.url }))),
  };
}

/**
 * A program link's text: "<display name> <sport>" ("Stanford field hockey", "St. Lawrence soccer")
 * — the page is the college's own, so the label names the college and the sport, never the host.
 */
function programLink(college: College, program: CollegeProgram): CommitSourceLink | null {
  return program.url === null
    ? null
    : { label: `${collegeDisplayName(college)} ${SPORT_WORDS[program.sport]}`, url: program.url };
}

/** `/commits`: every commitment by class, then every college with how many players committed there. */
export function buildCommitsView(): CommitsView {
  const file = getCommitsFile();
  const commitments = getCommitments();
  const trackedTeams = getRosters().teams.length;

  const classes: CommitClassGroup[] = [];
  for (const c of commitments) {
    const cls = commitClassOf(c);
    const id = cls === null ? 'class-unknown' : `class-${cls}`;
    let group = classes.find((g) => g.id === id);
    if (!group) {
      group = { id, heading: cls === null ? 'Class year not listed' : `Class of ${cls}`, meta: '', rows: [] };
      classes.push(group);
    }
    group.rows.push(commitRow(c));
  }
  for (const g of classes) g.meta = plural(g.rows.length, 'player');

  const colleges: CollegeRow[] = getColleges().map((college) => {
    const ties = getCollegeCommitments(college.slug);
    return {
      slug: college.slug,
      anchor: collegeAnchor(college.slug),
      name: collegeDisplayName(college),
      fullName: college.shortName !== null ? college.name : null,
      place: placeWords(college),
      programs: college.programs.map((p) => ({
        sport: p.sport,
        facts: [sportLabel(p.sport), DIVISION_WORDS[p.division], p.conference].filter((f): f is string => f !== null),
        link: programLink(college, p),
      })),
      countLine: plural(ties.length, 'player'),
      schools: [...new Set(ties.map((c) => schoolName(c.teamSlug)))].sort((a, b) => a.localeCompare(b)),
    };
  });

  const playerCount = commitments.length;
  const schoolCount = new Set(commitments.map((c) => c.teamSlug)).size;
  return {
    lede: ledeWords(
      trackedTeams,
      commitments.map((c) => ({
        teamSlug: c.teamSlug,
        college: c.college,
        sport: c.sport,
        division: commitProgram(c).program.division,
      })),
    ),
    classes,
    colleges,
    trackedTeams,
    playerCount,
    schoolCount,
    collegeCount: colleges.length,
    capturedOn: dateWithYear(file.capturedAt),
  };
}

/**
 * The page's one-paragraph answer: what it lists, then how many players, from how many schools, to
 * how many colleges, at which levels and in which sports. Pure (one entry per commitment, with its
 * sport and the level of that college's team in it), so its wording can be tested on any mix. A
 * program is one college's team in one sport:
 *   one level, one program    "…, an NCAA Division I field hockey program."
 *   one level, several        "…, all NCAA Division I field hockey programs."
 *   several levels            "… Of them, 4 committed to NCAA Division I field hockey programs and 1
 *                             to an NCAA Division III field hockey program."
 *   several sports            the levels without the sport, then "By sport, 7 in field hockey, 2 in
 *                             lacrosse and 1 in soccer." (the most players first)
 */
export function ledeWords(
  trackedTeams: number,
  commitments: ReadonlyArray<{ teamSlug: string; college: string; sport: CommitSport; division: CollegeDivision }>,
): string {
  const opening = `Which players on this site’s ${trackedTeams} varsity rosters have committed to play a sport in college, field hockey or any other, according to public pages that name the player, the college and the sport.`;
  if (commitments.length === 0) return `${opening} No public page we found shows a commitment by a player here yet.`;
  const players = commitments.length;
  const schools = new Set(commitments.map((c) => c.teamSlug)).size;
  const colleges = new Set(commitments.map((c) => c.college)).size;
  // Per sport, the most players first; a stable sort keeps COMMIT_SPORTS' order on a tie.
  const sports = COMMIT_SPORTS.map((sport) => ({ sport, n: commitments.filter((c) => c.sport === sport).length }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n);
  // With one sport it goes in the level words; with several, in a sentence of its own.
  const oneSport = sports.length === 1 ? ` ${SPORT_WORDS[sports[0].sport]}` : '';
  // Per level: how many players, and how many distinct programs (college and sport) they committed to.
  const byDivision = COLLEGE_DIVISIONS.flatMap((d) => {
    const here = commitments.filter((c) => c.division === d);
    const programs = new Set(here.map((c) => `${c.college} ${c.sport}`)).size;
    return here.length === 0 ? [] : [{ n: here.length, programs, words: `${DIVISION_WORDS[d]}${oneSport}` }];
  });
  // Every level's words start with "N" ("NCAA", "NAIA"), so the article is always "an".
  const programWords = (k: number, words: string) => (k === 1 ? `an ${words} program` : `${words} programs`);
  const who = `${plural(players, 'player')} from ${plural(schools, 'school')} ${players === 1 ? 'has' : 'have'} committed to ${plural(colleges, 'college')}`;
  const bySport =
    sports.length > 1 ? ` By sport, ${listWords(sports.map(({ sport, n }) => `${n} in ${SPORT_WORDS[sport]}`))}.` : '';
  if (byDivision.length === 1) {
    const only = byDivision[0];
    return `${opening} ${who}, ${only.programs === 1 ? programWords(1, only.words) : `all ${programWords(only.programs, only.words)}`}.${bySport}`;
  }
  const parts = byDivision.map(({ n, programs, words }, i) => `${n} ${i === 0 ? 'committed ' : ''}to ${programWords(programs, words)}`);
  return `${opening} ${who}. Of them, ${listWords(parts)}.${bySport}`;
}
