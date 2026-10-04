import { getCommitsFile } from '../../lib/commits';
import { dateWithYear, gradeWord, shortDate, toLocalTimestamp } from '../../lib/format';
import {
  getEnrichedTeamRoster,
  getRosters,
  sortedPlayers,
  type EnrichmentSource,
  type MergedPlayer,
  type MergedTeamRoster,
  type OtherRosters,
  type ProfilePlatform,
  type RosterConflict,
} from '../../lib/rosters';
import type { TeamSlug } from '../../lib/types';
import { playerClubGroups, type RosterClubGroup } from '../clubs/club-view';
import { playerCommitLine, type RosterCommitLine } from '../commits/commit-view';

/**
 * The team page's roster section (SPEC §1.1j), derived from the merged MaxPreps + enrichment
 * view in lib/rosters.ts, for every team of all five leagues. Pure, so tests/ui/roster-view.test.ts
 * can assert it over the real files.
 *
 * What the page promises, and this module enforces:
 *   - varsity only: rows a school source marks JV are left out and counted (Los Gatos' MaxPreps
 *     page is the whole program);
 *   - a blank is a blank: a fact nobody published is simply not printed, never guessed;
 *   - a value that did NOT come from MaxPreps carries `elsewhere`, which the page marks with †
 *     and explains under the list, with a link to every page those values came from;
 *   - where a source disagrees with the value shown, the disagreement is published (DESIGN §9's
 *     posture: trust comes from showing the disagreement, not from silently picking a side);
 *   - a player's own recruiting pages (NCSA and the like) are linked from that player's row;
 *   - a player a public page ties to a club gets a club line linking that club's page on this site
 *     (DESIGN §17.4), current clubs first; a club a source only lists, with no date that makes it
 *     current, is never worded as current. The words are components/clubs/club-view.ts'
 *     (`playerClubGroups`), so the team page and the club pages say the same thing;
 *   - a player a public page says has committed to play a college sport (field hockey or another,
 *     which the line names) gets a commitment line linking that player's row on /commits (DESIGN
 *     §21.5), which cites the sources. It says "Signed" only where a source does. The words are
 *     components/commits/commit-view.ts' (`playerCommitLine`), shared with /commits.
 */

/** MaxPreps' field hockey position codes. Anything else is printed as the coach wrote it. */
const POSITION_WORDS: Record<string, string> = {
  F: 'Forward',
  M: 'Midfield',
  D: 'Defense',
  G: 'Goalkeeper',
};

/**
 * How a conflict sentence names the source that disagrees. A MaxPreps roster page of an earlier
 * season is named by its URL instead (seasonPage below): the `maxpreps-career` and `maxpreps-jv`
 * kinds cover those pages too, since they give a dated class year the same way a career page does.
 * `news` covers student papers and local news alike (the Redwood Bark, BenitoLink), so it says
 * neither.
 */
const KIND_WORDS: Record<EnrichmentSource['kind'], string> = {
  'school-site': 'the school site',
  'school-pdf': "the school's roster PDF",
  news: 'a news story',
  'maxpreps-jv': "MaxPreps' JV roster",
  'maxpreps-career': 'a MaxPreps career page',
  'maxpreps-team': "MaxPreps' team page",
};

/** How the † footnote names each kind of source a shown value came from. */
const FOOTNOTE_WORDS: Record<EnrichmentSource['kind'], [one: string, many: string]> = {
  'school-site': ["the school's athletics site", "the school's athletics site"],
  'school-pdf': ["the school's roster PDF", "the school's roster PDF"],
  news: ['a news story', 'news stories'],
  'maxpreps-jv': ["MaxPreps' JV roster", "MaxPreps' JV rosters"],
  'maxpreps-career': ['a MaxPreps career page', 'MaxPreps career pages'],
  'maxpreps-team': ["MaxPreps' team page", "MaxPreps' team page"],
};

/**
 * A MaxPreps roster page of a given season ("/field-hockey/25-26/roster/", "/field-hockey/jv/25-26/
 * roster/"): what it is, so a label says "MaxPreps 2025-26 roster" rather than "career". null for
 * anything else (a career page, a current-season page with no year in its path).
 */
export function seasonPage(url: string): { season: string; jv: boolean; label: string } | null {
  const m = /^https:\/\/www\.maxpreps\.com\/.+\/field-hockey\/(?:(jv|freshman)\/)?(\d{2})-(\d{2})\/roster\/?$/.exec(url);
  if (!m) return null;
  const season = `20${m[2]}-${m[3]}`;
  const level = m[1] === 'jv' ? ' JV' : m[1] === 'freshman' ? ' freshman' : '';
  return { season, jv: m[1] === 'jv', label: `${season}${level} roster` };
}

/** Seasons between a page's season ("2025-26") and the roster file's ("26-27"): 1. */
function seasonsSince(pageSeason: string): number {
  const current = /^(\d{2})-\d{2}$/.exec(getRosters().season);
  const page = /^20(\d{2})-\d{2}$/.exec(pageSeason);
  return current && page ? Number(current[1]) - Number(page[1]) : 0;
}

/** A row's link text, and how the footnote names the platform. */
const PROFILE_WORDS: Record<ProfilePlatform, { link: string; footnote: string }> = {
  ncsa: { link: 'NCSA profile', footnote: 'NCSA' },
  sportsrecruits: { link: 'SportsRecruits profile', footnote: 'SportsRecruits' },
  fieldlevel: { link: 'FieldLevel profile', footnote: 'FieldLevel' },
  hudl: { link: 'Hudl profile', footnote: 'Hudl' },
  captainu: { link: 'Captain U profile', footnote: 'Captain U' },
  personal: { link: 'Recruiting site', footnote: 'personal sites' },
};
const PROFILE_ORDER = Object.keys(PROFILE_WORDS) as ProfilePlatform[];

const FIELD_WORDS: Record<RosterConflict['field'], string> = {
  jersey: 'number',
  grade: 'grade',
  position: 'position',
  height: 'height',
};

export interface RosterFact {
  text: string;
  /** true when the value came from a source other than MaxPreps (the page marks it †). */
  elsewhere: boolean;
}

export interface RosterProfileLink {
  /** "NCSA profile", "Recruiting site" … */
  label: string;
  url: string;
}

export interface RosterRow {
  key: string;
  name: string;
  jersey: RosterFact | null;
  captain: boolean;
  /** Grade, position(s), height — only the ones somebody published, in that order. */
  facts: RosterFact[];
  /** The player's own recruiting pages, one per platform, NCSA first. */
  profiles: RosterProfileLink[];
  /**
   * The clubs a public page ties the player to, grouped current, listed, earlier; [] for most rows.
   * Internal links to /clubs/<slug>: they never join `sources`, which back up values the list shows.
   */
  clubs: RosterClubGroup[];
  /**
   * The college a public page says the player has committed to, or null (most rows). An internal
   * link to the player's row on /commits: it never joins `sources`, which back up values the list
   * shows.
   */
  commitment: RosterCommitLine | null;
}

export interface RosterConflictLine {
  key: string;
  name: string;
  /** "number", "grade" … */
  field: string;
  /** What the list shows; null when it shows nothing for that field. */
  shown: string | null;
  /** What the other source shows, in the list's words ("freshman" on a 2025-26 roster). */
  other: string;
  /**
   * The grade that value means now, when the source is an earlier season's roster ("sophomore"
   * for a 2025-26 freshman); null when `other` is already this season's.
   */
  now: string | null;
  /**
   * true when `other` is this season's grade worked out from a dated class year on a MaxPreps
   * career page, which shows a class year, not this grade.
   */
  derived: boolean;
  /** "the school site", "a news story", "MaxPreps' 2025-26 roster" … */
  sourceLabel: string;
  sourceUrl: string;
}

export interface RosterSourceLink {
  label: string;
  url: string;
}

export interface RosterView {
  teamName: string;
  status: MergedTeamRoster['status'];
  rows: RosterRow[];
  /** false when nobody published a number for any listed player: the column is dropped. */
  showNumbers: boolean;
  /** The longest number on the list, in characters ("21/88" is 5), to size that column. */
  numberChars: number;
  /** Rows a school source says are JV, left off this varsity list. */
  jvLeftOut: number;
  /** Any value on the list came from a source other than MaxPreps. */
  hasElsewhere: boolean;
  /** Some grade is worked out from a class year on another season (Los Altos, Saratoga). */
  hasDerivedGrade: boolean;
  /** The platforms the listed rows link to, as the footnote names them ("NCSA", "SportsRecruits"). */
  profilePlatforms: string[];
  /** Some listed row has a club line: the footnote explains them. */
  hasClubs: boolean;
  /** Some club line is a "Listed club" (status unknown): the footnote says what that means. */
  hasListedClub: boolean;
  /** Some listed row has a commitment line: the footnote explains them. */
  hasCommitments: boolean;
  /**
   * "Oct 3, 2026": when the commitments were researched. The footnote dates them, since the roster's
   * other "as of" is MaxPreps' twice-daily read and a commitment line is not refreshed with it.
   */
  commitsCheckedOn: string;
  coaches: Array<{ key: string; name: string; role: string | null }>;
  conflicts: RosterConflictLine[];
  /** MaxPreps' roster page first, then one link per other site a shown value came from. */
  sources: RosterSourceLink[];
  rosterUrl: string | null;
  /** "Fri Oct 2": when MaxPreps was read (older than the file when carried forward). */
  asOf: string | null;
  /** The kinds of source the †-marked values came from, as the footnote names them. */
  elsewhereSources: string[];
  /**
   * What other public sources showed for the current roster, as the enrichment file records it
   * per team (lib/rosters.ts `OtherRosters`). The empty state says only what this says: "none" is
   * the one case that may claim no other source has a roster.
   */
  otherRosters: OtherRosters;
}

function positionWords(codes: readonly string[]): string {
  return codes.map((c) => POSITION_WORDS[c] ?? c).join(' / ');
}

/** A conflict's value in the list's own words, lower-cased for the middle of a sentence. */
function conflictValue(field: RosterConflict['field'], value: string): string {
  if (field === 'grade' && /^\d+$/.test(value)) return gradeWord(Number(value)).toLowerCase();
  if (field === 'position') return positionWords(value.split(/\s*[,/]\s*/)).toLowerCase();
  return value;
}

/**
 * One recorded disagreement as the list states it. A grade from an earlier season's roster is
 * stored a season on (a 2025-26 freshman is stored as 10); the line says what that page shows and
 * what it means now, so it never prints a grade the page does not show.
 */
function conflictLine(p: MergedPlayer, c: RosterConflict, i: number): RosterConflictLine {
  const page = seasonPage(c.source);
  const base = {
    key: `${p.athleteId ?? p.fullName}-${c.field}-${i}`,
    name: p.fullName,
    field: FIELD_WORDS[c.field],
    shown: c.kept === null ? null : conflictValue(c.field, c.kept),
    sourceUrl: c.source,
  };
  if (page) {
    const sourceLabel = `MaxPreps' ${page.label}`;
    const since = seasonsSince(page.season);
    const then = Number(c.other) - since;
    if (c.field === 'grade' && /^\d+$/.test(c.other) && since > 0 && then >= 9) {
      return {
        ...base,
        other: conflictValue('grade', String(then)),
        now: conflictValue('grade', c.other),
        derived: false,
        sourceLabel,
      };
    }
    return { ...base, other: conflictValue(c.field, c.other), now: null, derived: false, sourceLabel };
  }
  return {
    ...base,
    other: conflictValue(c.field, c.other),
    now: null,
    derived: c.field === 'grade' && c.kind === 'maxpreps-career',
    sourceLabel: KIND_WORDS[c.kind],
  };
}

/** A provenance tag that is not MaxPreps — the enrichment record, with its source URL. */
function elsewhereSource(tag: MergedPlayer['provenance'][keyof MergedPlayer['provenance']]) {
  return tag !== null && tag !== 'maxpreps' ? tag : null;
}

function rowFor(team: TeamSlug, p: MergedPlayer, index: number): RosterRow {
  const facts: RosterFact[] = [];
  if (p.grade !== null) {
    facts.push({ text: gradeWord(p.grade), elsewhere: elsewhereSource(p.provenance.grade) !== null });
  }
  if (p.positions.length > 0) {
    facts.push({
      text: positionWords(p.positions),
      elsewhere: elsewhereSource(p.provenance.positions) !== null,
    });
  }
  if (p.height !== null) {
    facts.push({ text: p.height, elsewhere: elsewhereSource(p.provenance.height) !== null });
  }
  return {
    key: p.athleteId ?? `${p.fullName}-${index}`,
    name: p.fullName,
    jersey:
      p.jersey === null
        ? null
        : { text: p.jersey, elsewhere: elsewhereSource(p.provenance.jersey) !== null },
    captain: p.isCaptain,
    facts,
    profiles: [...p.profiles]
      .sort((a, b) => PROFILE_ORDER.indexOf(a.platform) - PROFILE_ORDER.indexOf(b.platform))
      .map((x) => ({ label: PROFILE_WORDS[x.platform].link, url: x.url })),
    clubs: playerClubGroups(team, p.athleteId),
    commitment: playerCommitLine(team, p.athleteId),
  };
}

function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** What a source link backs up, in the order its label lists them. */
const USE_WORDS = {
  grade: ['grade', 'grades'],
  position: ['position', 'positions'],
  number: ['number', 'numbers'],
  height: ['height', 'heights'],
  coaches: ['coaches', 'coaches'],
} as const;
type SourceUse = keyof typeof USE_WORDS;

const PROVENANCE_USE: Record<keyof MergedPlayer['provenance'], SourceUse> = {
  grade: 'grade',
  positions: 'position',
  jersey: 'number',
  height: 'height',
};

/** More pages than this from one site and kind fold into that site's team page. */
const FOLD_OVER = 2;

/** A source link's label: the site, or for MaxPreps what the page is (by its URL, not its kind). */
function siteLabel(kind: EnrichmentSource['kind'], host: string, url: string): string {
  const page = kind.startsWith('maxpreps-') ? seasonPage(url) : null;
  if (page) return `MaxPreps ${page.label}`;
  switch (kind) {
    case 'maxpreps-team':
      return 'MaxPreps team page';
    case 'maxpreps-jv':
      return 'MaxPreps JV roster';
    case 'maxpreps-career':
      return 'MaxPreps career';
    case 'school-pdf':
      return `${host} roster PDF`;
    default:
      return host;
  }
}

function usesText(uses: Map<SourceUse, number>): string {
  return (Object.keys(USE_WORDS) as SourceUse[])
    .filter((u) => uses.has(u))
    .map((u) => USE_WORDS[u][uses.get(u)! === 1 ? 0 : 1])
    .join(', ');
}

/**
 * Every page behind a value the list shows, so each † can be checked: MaxPreps' roster first,
 * then one link per source URL in first-use order, labelled with the site and what it supplied
 * ("MaxPreps JV roster: grade", "losgatosathletics.org: coaches").
 *
 * Deduplicated by URL, never by site: MaxPreps' career, JV and team pages each back up values the
 * roster page does not carry. Where one site supplied a value from a separate page per player
 * (Saratoga's and Lynbrook's player profiles), the pages fold into the one team roster page the
 * enrichment file lists for that site, which links to every profile. Disagreements are linked
 * where they are listed, not here: they are not values the list shows.
 */
function sourceLinks(team: MergedTeamRoster, players: MergedPlayer[]): RosterSourceLink[] {
  interface Entry {
    url: string;
    host: string;
    kind: EnrichmentSource['kind'];
    uses: Map<SourceUse, number>;
    names: string[];
  }
  const entries = new Map<string, Entry>();
  const note = (url: string, kind: EnrichmentSource['kind'], use: SourceUse, name?: string) => {
    if (url === team.rosterUrl) return;
    const host = hostLabel(url);
    if (!host) return;
    let e = entries.get(url);
    if (!e) {
      e = { url, host, kind, uses: new Map(), names: [] };
      entries.set(url, e);
    }
    e.uses.set(use, (e.uses.get(use) ?? 0) + 1);
    if (name && !e.names.includes(name)) e.names.push(name);
  };
  for (const p of players) {
    for (const field of Object.keys(PROVENANCE_USE) as Array<keyof MergedPlayer['provenance']>) {
      const source = elsewhereSource(p.provenance[field]);
      if (source) note(source.source, source.kind, PROVENANCE_USE[field], p.lastName ?? p.fullName);
    }
  }
  for (const c of team.coaches) {
    const kind =
      team.sources.find((s) => s.url === c.source)?.kind ??
      (hostLabel(c.source) === 'maxpreps.com' ? 'maxpreps-team' : 'school-site');
    note(c.source, kind, 'coaches');
  }

  const groups = new Map<string, Entry[]>();
  for (const e of entries.values()) {
    // A coaches page is linked as itself: only runs of per-player pages fold into the roster page.
    const coachesOnly = e.uses.size === 1 && e.uses.has('coaches');
    const key = `${e.host} ${e.kind}${coachesOnly ? ' coaches' : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const links: RosterSourceLink[] = [];
  if (team.rosterUrl) links.push({ label: 'MaxPreps roster', url: team.rosterUrl });
  for (const group of groups.values()) {
    const { host, kind } = group[0];
    const label = siteLabel(kind, host, group[0].url);
    // MaxPreps career and JV pages are never folded: each backs up values the roster page lacks.
    if (group.length > FOLD_OVER && !kind.startsWith('maxpreps-')) {
      const teamPage = team.sources.find(
        (s) => s.kind === kind && hostLabel(s.url) === host && !entries.has(s.url),
      );
      if (teamPage) {
        const uses = new Map<SourceUse, number>();
        for (const e of group) for (const [u, n] of e.uses) uses.set(u, (uses.get(u) ?? 0) + n);
        links.push({ label: `${label}: ${usesText(uses)} (player pages)`, url: teamPage.url });
        continue;
      }
    }
    const labels = group.map((e) => `${siteLabel(e.kind, e.host, e.url)}: ${usesText(e.uses)}`);
    group.forEach((e, i) => {
      // Two pages that would read the same ("lahstalon.org: grade" twice) say whose values they hold.
      const clash = labels.filter((l) => l === labels[i]).length > 1;
      const who =
        e.names.length > 2 ? `${e.names.slice(0, 2).join(', ')} +${e.names.length - 2}` : e.names.join(', ');
      links.push({ label: clash && who ? `${labels[i]} (${who})` : labels[i], url: e.url });
    });
  }
  return links;
}

/**
 * The kinds of page the list's †-marked values came from, in first-use order, as the footnote
 * names them ("the school's athletics site", "a news story", "MaxPreps' 2025-26 roster"): the
 * footnote names only sources this team's list actually uses.
 */
function elsewhereSources(players: MergedPlayer[]): string[] {
  const urls = new Map<string, Set<string>>();
  for (const p of players) {
    for (const tag of Object.values(p.provenance)) {
      const source = elsewhereSource(tag);
      if (!source) continue;
      const page = source.kind.startsWith('maxpreps-') ? seasonPage(source.source) : null;
      const key = page ? `MaxPreps' ${page.label}` : source.kind;
      urls.set(key, (urls.get(key) ?? new Set()).add(source.source));
    }
  }
  return [...urls].map(([key, set]) => {
    const words = FOOTNOTE_WORDS[key as EnrichmentSource['kind']];
    return words ? words[set.size === 1 ? 0 : 1] : key;
  });
}

/**
 * The roster section for any registry team, in every league. null only for a slug lib/rosters.ts
 * does not hold (not a registry team), so the team page never prints an empty state for something
 * that does not exist. A team no run has covered yet has status 'pending' and says so; one whose
 * fetch failed with nothing to fall back on has status 'error'; one MaxPreps lists no players for
 * has status 'empty'. Never throws for a registry slug.
 */
export function buildRosterView(slug: TeamSlug): RosterView | null {
  const team = getEnrichedTeamRoster(slug);
  if (!team) return null;

  const varsity = team.players.filter((p) => p.level !== 'jv');
  const players = sortedPlayers({ players: varsity });
  const rows = players.map((p, i) => rowFor(slug, p, i));

  const conflicts: RosterConflictLine[] = players.flatMap((p) => p.conflicts.map((c, i) => conflictLine(p, c, i)));

  return {
    teamName: team.name,
    status: team.status,
    rows,
    showNumbers: rows.some((r) => r.jersey !== null),
    numberChars: Math.max(0, ...rows.map((r) => r.jersey?.text.length ?? 0)),
    jvLeftOut: team.players.length - varsity.length,
    hasElsewhere: rows.some((r) => r.jersey?.elsewhere || r.facts.some((f) => f.elsewhere)),
    hasDerivedGrade: players.some((p) => {
      const g = elsewhereSource(p.provenance.grade);
      return g !== null && 'derived' in g && g.derived;
    }),
    profilePlatforms: PROFILE_ORDER.filter((k) =>
      players.some((p) => p.profiles.some((x) => x.platform === k)),
    ).map((k) => PROFILE_WORDS[k].footnote),
    hasClubs: rows.some((r) => r.clubs.length > 0),
    hasListedClub: rows.some((r) => r.clubs.some((g) => g.status === 'unknown')),
    hasCommitments: rows.some((r) => r.commitment !== null),
    commitsCheckedOn: dateWithYear(getCommitsFile().capturedAt),
    coaches: team.coaches.map((c, i) => ({ key: `${c.name}-${i}`, name: c.name, role: c.role })),
    conflicts,
    sources: sourceLinks(team, players),
    rosterUrl: team.rosterUrl,
    asOf: team.fetchedAt ? shortDate(toLocalTimestamp(team.fetchedAt)) : null,
    elsewhereSources: elsewhereSources(players),
    otherRosters: team.otherRosters,
  };
}
