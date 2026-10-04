import { clubDisplayName, getClubs } from '../../lib/clubs';
import {
  collegeDisplayName,
  commitClassOf,
  getCollege,
  getCollegeCommitments,
  getColleges,
  getCommitments,
  getCommitsFile,
  getCommittedPlayer,
  getPlayerCommitment,
  type College,
  type CollegeDivision,
  type CommitSource,
  type CommitStatus,
  type Commitment,
} from '../../lib/commits';
import { COLLEGE_DIVISIONS } from '../../lib/commits-schema';
import { dateWithYear, gradeWord, listWords, partialDate } from '../../lib/format';
import { getRosters } from '../../lib/rosters';
import { getTeamBySlug } from '../../lib/teams';
import type { TeamSlug } from '../../lib/types';
import { plural } from '../ui/plural';

/**
 * The college commitments page (/commits) and the team roster's commitment line (SPEC §1.1j3,
 * DESIGN §19), derived from lib/commits.ts. Pure, so tests/ui/commit-view.test.ts can assert it
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
 *   - link labels come from the source kind and the host, never from a URL path — apart from the
 *     page-type tests (`/athlete/`, `/athletes/`, `/athletic-scholarships/`), so a name in a slug is
 *     never printed;
 *   - every row links the pages it rests on, each URL once.
 */

// ---------------------------------------------------------------- wording tables

/** A college's level in words: "NCAA Division I". The order is COLLEGE_DIVISIONS'. */
export const DIVISION_WORDS: Record<CollegeDivision, string> = {
  'ncaa-d1': 'NCAA Division I',
  'ncaa-d2': 'NCAA Division II',
  'ncaa-d3': 'NCAA Division III',
  naia: 'NAIA',
};

/** A news or other site a source sits on: its link text. Any other host is printed as itself. */
const OUTLETS: Readonly<Record<string, string>> = {
  'sticktogetherfh.com': 'Stick Together',
  'fhcollegepath.com': 'FH College Path',
  'lahstalon.org': 'The Talon',
  'siwildcats.com': 'St. Ignatius athletics',
  'maxfh.longstreth.com': 'MAX Field Hockey',
  'maxfieldhockey.com': 'MAX Field Hockey',
  'nfhca.org': 'NFHCA',
  'gilroydispatch.com': 'Gilroy Dispatch',
  'marinij.com': 'Marin Independent Journal',
  'paloaltoonline.com': 'Palo Alto Online',
  'losaltosonline.com': 'Los Altos Town Crier',
  'mercurynews.com': 'Mercury News',
};

/** The recruiting platforms' profile links. */
const PLATFORM_LABELS = {
  ncsa: 'NCSA profile',
  hudl: 'Hudl profile',
  fieldlevel: 'FieldLevel profile',
} as const;

/** The host without `www.`: "nfhca.sportsrecruits.com". Every URL here is https (the schema). */
function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

/** Which club's own site a host is: every club of data/clubs.json with a website, by host. */
const CLUB_BY_HOST: ReadonlyMap<string, string> = new Map(
  getClubs().flatMap((c) => (c.website ? [[hostOf(c.website), clubDisplayName(c)] as const] : [])),
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
      return college.programUrl !== null && hostOf(college.programUrl) === host
        ? `${collegeDisplayName(college)} athletics`
        : host;
    case 'club-site': {
      const club = CLUB_BY_HOST.get(host);
      return club ? `${club} site` : host;
    }
    default:
      return OUTLETS[host] ?? host;
  }
}

/**
 * A commitment's status in words (DESIGN §19.3):
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

/** " (2)", " (3)" on a label that repeats within one list, so no two links read the same. */
function numbered<T extends { label: string }>(links: T[]): T[] {
  const seen = new Map<string, number>();
  return links.map((link) => {
    const n = (seen.get(link.label) ?? 0) + 1;
    seen.set(link.label, n);
    return n === 1 ? link : { ...link, label: `${link.label} (${n})` };
  });
}

/** The school a team slug is, by its registry name ("St. Ignatius College Preparatory"). */
function schoolName(slug: string): string {
  return getTeamBySlug(slug)?.name ?? slug;
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

/** A roster row's commitment line: "Committed: Stanford", linking the player's row on /commits. */
export interface RosterCommitLine {
  status: CommitStatus;
  label: 'Committed' | 'Signed';
  /** The same words for the link's accessible name ("Pat Example’s college commitment: Stanford"). */
  srLabel: 'college commitment' | 'college signing';
  college: { slug: string; name: string; href: string };
}

/** null for a row without a MaxPreps athleteId or a player no source says has committed — most rows. */
export function playerCommitLine(teamSlug: TeamSlug, athleteId: string | null): RosterCommitLine | null {
  if (athleteId === null) return null;
  const c = getPlayerCommitment(teamSlug, athleteId);
  if (c === null) return null;
  const college = getCollege(c.college)!;
  return {
    status: c.status,
    label: c.status === 'signed' ? 'Signed' : 'Committed',
    srLabel: c.status === 'signed' ? 'college signing' : 'college commitment',
    college: { slug: college.slug, name: collegeDisplayName(college), href: `/commits#${commitAnchor(c)}` },
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
    /** "NCAA Division I" */
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

export interface CollegeRow {
  slug: string;
  /** collegeAnchor() */
  anchor: string;
  /** The display name. */
  name: string;
  /** The official name, only when the display name is a short one. */
  fullName: string | null;
  /** The division, the conference when known, and the place: ["NCAA Division I", "ACC", "Stanford, CA"]. */
  facts: string[];
  /** "2 players", "1 player". */
  countLine: string;
  /** The committed players' schools, by registry name, distinct and alphabetical. */
  schools: string[];
  /** The field hockey page on the college's own site, when the record has one. */
  program: CommitSourceLink | null;
}

export interface CommitsView {
  lede: string;
  /** The earliest class first; [] when no commitment is in the file. */
  classes: CommitClassGroup[];
  /** lib/commits.ts getColleges() order: the most players first. */
  colleges: CollegeRow[];
  /** The tracked rosters: 43. */
  trackedTeams: number;
  playerCount: number;
  schoolCount: number;
  collegeCount: number;
  /** "Oct 3, 2026": when the research was done. */
  capturedOn: string;
}

function commitRow(c: Commitment): CommitRow {
  const row = getCommittedPlayer(c);
  const college = getCollege(c.college)!;
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
      division: DIVISION_WORDS[college.division],
    },
    status: statusWords(c),
    statusKind: c.status,
    sources: numbered(sources.map((s) => ({ label: sourceLabel(s, college), url: s.url }))),
  };
}

/**
 * The program link's text: "<display name> field hockey" — the page is the college's own, so the
 * label names the college, never the host.
 */
function programLink(college: College): CommitSourceLink | null {
  return college.programUrl === null
    ? null
    : { label: `${collegeDisplayName(college)} field hockey`, url: college.programUrl };
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
      facts: [DIVISION_WORDS[college.division], college.conference, placeWords(college)].filter(
        (f): f is string => f !== null,
      ),
      countLine: plural(ties.length, 'player'),
      schools: [...new Set(ties.map((c) => schoolName(c.teamSlug)))].sort((a, b) => a.localeCompare(b)),
      program: programLink(college),
    };
  });

  const playerCount = commitments.length;
  const schoolCount = new Set(commitments.map((c) => c.teamSlug)).size;
  return {
    lede: ledeWords(
      trackedTeams,
      commitments.map((c) => ({ teamSlug: c.teamSlug, college: c.college, division: getCollege(c.college)!.division })),
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
 * how many colleges, and at which levels. Pure (one entry per commitment, with its college's
 * level), so its wording can be tested on any mix:
 *   one level, one program    "…, an NCAA Division I program."
 *   one level, several        "…, all NCAA Division I programs."
 *   several levels            "… Of them, 4 committed to NCAA Division I programs and 1 to an NCAA
 *                             Division III program."
 */
export function ledeWords(
  trackedTeams: number,
  commitments: ReadonlyArray<{ teamSlug: string; college: string; division: CollegeDivision }>,
): string {
  const opening = `Which players on this site’s ${trackedTeams} varsity rosters have committed to play field hockey in college, according to public pages that name both the player and the college.`;
  if (commitments.length === 0) return `${opening} No public page we found shows a commitment by a player here yet.`;
  const players = commitments.length;
  const schools = new Set(commitments.map((c) => c.teamSlug)).size;
  const colleges = new Set(commitments.map((c) => c.college)).size;
  // Per level: how many players, and how many distinct programs they committed to.
  const byDivision = COLLEGE_DIVISIONS.flatMap((d) => {
    const here = commitments.filter((c) => c.division === d);
    const programs = new Set(here.map((c) => c.college)).size;
    return here.length === 0 ? [] : [{ n: here.length, programs, words: DIVISION_WORDS[d] }];
  });
  // Every level's words start with "N" ("NCAA", "NAIA"), so the article is always "an".
  const programWords = (k: number, words: string) => (k === 1 ? `an ${words} program` : `${words} programs`);
  const who = `${plural(players, 'player')} from ${plural(schools, 'school')} ${players === 1 ? 'has' : 'have'} committed to ${plural(colleges, 'college')}`;
  if (byDivision.length === 1) {
    const only = byDivision[0];
    return `${opening} ${who}, ${only.programs === 1 ? programWords(1, only.words) : `all ${programWords(only.programs, only.words)}`}.`;
  }
  const parts = byDivision.map(({ n, programs, words }, i) => `${n} ${i === 0 ? 'committed ' : ''}to ${programWords(programs, words)}`);
  return `${opening} ${who}. Of them, ${listWords(parts)}.`;
}
