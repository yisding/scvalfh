import { dateWithYear, gradeWord, partialDate, partialDateKind } from '../../lib/format';
import {
  SEARCHED_REGIONS,
  clubDisplayName,
  getAffiliatedPlayer,
  getClub,
  getClubAffiliations,
  getClubs,
  getClubsFile,
  getPlayerClubs,
  type AffiliationSource,
  type AffiliationStatus,
  type Club,
  type ClubAffiliation,
  type ClubRegion,
} from '../../lib/clubs';
import { CLUB_REGIONS } from '../../lib/clubs-schema';
import { getRosters } from '../../lib/rosters';
import { getTeamBySlug } from '../../lib/teams';
import type { TeamSlug } from '../../lib/types';
import { plural } from '../ui/plural';

/**
 * The club pages (/clubs, /clubs/[slug]) and the team roster's club line (SPEC §1.1j2, DESIGN §16),
 * derived from lib/clubs.ts. Pure, so tests/ui/club-view.test.ts can assert it over the real files;
 * every word a club page or a club line prints about a club tie is chosen here, in one module.
 *
 * What the pages promise, and this module enforces:
 *   - only rows on the tracked varsity rosters are named: a row is an affiliation, and every
 *     affiliation joined a non-JV row of data/rosters.json at load (lib/clubs.ts), under that
 *     row's own spelling. A club's own roster names many more players; it is linked, never copied;
 *   - `quote`, `basis`, `confidence`, `statedSchool` and `statedClassYear` never reach a view type:
 *     the quote and the basis are for maintainers and can name people who are not players here, and
 *     a per-row confidence mark is not built (DESIGN §16.6);
 *   - `unknown` is never worded as current: it reads "Listed by <source>, <date>", and on the
 *     roster its group is "Listed club";
 *   - link labels come from the source kind and the host, never from a URL path — apart from the
 *     page-type tests (`/athlete/`, `/roster`, `/organization/`), so a label stays true when a page
 *     moves, and a name in a slug (a player's profile, a coach's page) is never printed;
 *   - every player row links the pages it rests on, each URL once.
 */

// ---------------------------------------------------------------- wording tables

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
  sacramento: { label: 'Sacramento', prep: 'in', place: 'Sacramento' },
  // Never searched (SEARCHED_REGIONS), so never in a "no club based …" sentence: HTC is here.
  elsewhere: { label: 'Elsewhere', prep: 'in', place: 'other places' },
};

/** "A", "A or B", "A, B or C". `listWords` joins with "and" only. */
function orWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

/**
 * "on the Peninsula or the Central Coast", "in the East Bay or on the Central Coast": the
 * preposition is repeated only where it changes.
 */
function basedWords(regions: readonly ClubRegion[]): string {
  return orWords(
    regions.map((r, i) => {
      const w = REGION_WORDS[r];
      return i > 0 && REGION_WORDS[regions[i - 1]].prep === w.prep ? w.place : `${w.prep} ${w.place}`;
    }),
  );
}

/** A news or other site a source sits on: its link text, and how a sentence names it. */
const OUTLETS: Readonly<Record<string, { label: string; inSentence: string }>> = {
  'sticktogetherfh.com': { label: 'Stick Together', inSentence: 'Stick Together' },
  'gilroydispatch.com': { label: 'Gilroy Dispatch', inSentence: 'the Gilroy Dispatch' },
  'scval.com': { label: 'SCVAL', inSentence: 'SCVAL' },
  'nfhca.org': { label: 'NFHCA', inSentence: 'the NFHCA' },
  'maxfh.longstreth.com': { label: 'MAX Field Hockey', inSentence: 'MAX Field Hockey' },
  'sfhsathletics.com': { label: 'Saint Francis athletics', inSentence: 'Saint Francis athletics' },
};

/** The recruiting platforms: a profile's link text, and the platform's name in a sentence. */
const PLATFORM_WORDS = {
  ncsa: { label: 'NCSA profile', inSentence: 'NCSA' },
  hudl: { label: 'Hudl profile', inSentence: 'Hudl' },
  fieldlevel: { label: 'FieldLevel profile', inSentence: 'FieldLevel' },
  'maxpreps-career': { label: 'MaxPreps profile', inSentence: 'MaxPreps' },
} as const;

/** The host without `www.`: "flyfhc.com", "nfhca.sportsrecruits.com". Every URL here is https (the schema). */
function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

const isSportsRecruits = (host: string) => host === 'sportsrecruits.com' || host.endsWith('.sportsrecruits.com');

/** Which club's own site a host is: every club with a website, by host. */
const CLUB_BY_HOST: ReadonlyMap<string, Club> = new Map(
  getClubs().flatMap((c) => (c.website ? [[hostOf(c.website), c] as const] : [])),
);

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
  const owner = CLUB_BY_HOST.get(hostOf(url)) ?? null;
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
      return pathOf(src.url).includes('/athlete/') ? 'SportsRecruits profile' : 'SportsRecruits team page';
    case 'ncsa':
    case 'hudl':
    case 'fieldlevel':
    case 'maxpreps-career':
      return PLATFORM_WORDS[src.kind].label;
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
      return 'SportsRecruits';
    case 'ncsa':
    case 'hudl':
    case 'fieldlevel':
    case 'maxpreps-career':
      return PLATFORM_WORDS[src.kind].inSentence;
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
 * A tie's status in words (DESIGN §16.3), on `pageClub`'s page:
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

/** The last year an `asOf` covers (a range's or a season's end), for "latest first"; null last. */
function endYear(asOf: string | null): number {
  if (asOf === null) return Number.NEGATIVE_INFINITY;
  const kind = partialDateKind(asOf);
  if (kind === 'range') return Number(asOf.slice(5, 9));
  if (kind === 'season') return Number(asOf.slice(0, 4)) + 1;
  return Number(asOf.slice(0, 4));
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

// ---------------------------------------------------------------- shapes

export interface ClubLink {
  slug: string;
  /** The display name: "SF Hawks". */
  name: string;
  /** `/clubs/<slug>` */
  href: string;
}

export interface ClubSourceLink {
  label: string;
  url: string;
}

function clubLink(club: Club): ClubLink {
  return { slug: club.slug, name: clubDisplayName(club), href: `/clubs/${club.slug}` };
}

// ---------------------------------------------------------------- the team roster's club line

/** One status's clubs on a roster row: "Club: SF Hawks", "Earlier clubs: Fly FHC, Lightning". */
export interface RosterClubGroup {
  status: AffiliationStatus;
  label: 'Club' | 'Clubs' | 'Listed club' | 'Listed clubs' | 'Earlier club' | 'Earlier clubs';
  /** The same words for the link's accessible name ("Storey Lewis’s club: SF Hawks"). */
  srLabel: 'club' | 'clubs' | 'listed club' | 'listed clubs' | 'earlier club' | 'earlier clubs';
  /** Latest `asOf` first (a range's or season's end year; undated last), then display name. */
  clubs: ClubLink[];
}

const GROUP_WORDS = {
  current: { one: 'Club', many: 'Clubs', srOne: 'club', srMany: 'clubs' },
  unknown: { one: 'Listed club', many: 'Listed clubs', srOne: 'listed club', srMany: 'listed clubs' },
  past: { one: 'Earlier club', many: 'Earlier clubs', srOne: 'earlier club', srMany: 'earlier clubs' },
} as const;

/** What is true now, then what a source only lists, then what was. */
const GROUP_ORDER: readonly AffiliationStatus[] = ['current', 'unknown', 'past'];

/**
 * A roster row's club line, as groups in the order current, listed (unknown), earlier (past).
 * [] for a row without a MaxPreps athleteId or a player no source ties to a club — most rows.
 */
export function playerClubGroups(teamSlug: TeamSlug, athleteId: string | null): RosterClubGroup[] {
  if (athleteId === null) return [];
  const ties = getPlayerClubs(teamSlug, athleteId);
  return GROUP_ORDER.flatMap((status): RosterClubGroup[] => {
    const clubs = ties
      .filter((a) => a.status === status)
      .map((a) => ({ a, club: getClub(a.club)! }))
      .sort(
        (x, y) =>
          endYear(y.a.asOf) - endYear(x.a.asOf) ||
          clubDisplayName(x.club).localeCompare(clubDisplayName(y.club)),
      )
      .map(({ club }) => clubLink(club));
    if (clubs.length === 0) return [];
    const w = GROUP_WORDS[status];
    const many = clubs.length > 1;
    return [{ status, label: many ? w.many : w.one, srLabel: many ? w.srMany : w.srOne, clubs }];
  });
}

// ---------------------------------------------------------------- /clubs

export interface ClubIndexRow {
  slug: string;
  href: string;
  /** The display name. */
  name: string;
  /** The full name (only when a short name is displayed) and the city: "San Francisco Youth Field Hockey Club · San Francisco". */
  subline: string | null;
  current: number;
  /** Earlier, or listed without a date that makes them current. */
  other: number;
  /** "30 current players", "8 players: 2 current, 6 earlier or not known to be current". */
  countLine: string;
  /** The tied players' schools, by registry name, distinct and alphabetical. */
  schools: string[];
}

export interface ClubRegionGroup {
  id: ClubRegion;
  heading: string;
  /** "7 clubs" */
  meta: string;
  clubs: ClubIndexRow[];
}

export interface ClubsIndexView {
  lede: string;
  /** The regions that have a club, in CLUB_REGIONS order; clubs in getClubs() order (DESIGN §16.5). */
  regions: ClubRegionGroup[];
  /** The searched areas (lib/clubs.ts SEARCHED_REGIONS) with no club, as headings: ['Peninsula', 'Central Coast']. */
  regionsWithoutClubs: string[];
  /** "This list has no club based on the Peninsula or the Central Coast."; null when every area has one. */
  regionsWithoutClubsSentence: string | null;
  /** The tracked rosters: 43. */
  trackedTeams: number;
  /** Distinct players tied to any club. */
  playerCount: number;
  schoolCount: number;
  clubCount: number;
  clubsWithPlayers: number;
  /** "Oct 3, 2026": when the research was done. */
  capturedOn: string;
  /**
   * The club seasons a "current" tie comes from: the file's roster season and the one before it,
   * "2025-26 or 2026-27" for "26-27" (notes[3]).
   */
  currentSeasons: string;
}

/**
 * "30 current players", "1 current player", "8 players: 2 current, 6 earlier or not known to be
 * current" ("earlier" alone when no tie is `unknown`), "3 players, all earlier", or none found.
 */
export function countLine(ties: readonly Pick<ClubAffiliation, 'status'>[]): string {
  const current = ties.filter((a) => a.status === 'current').length;
  const other = ties.length - current;
  const otherWords = ties.some((a) => a.status === 'unknown') ? 'earlier or not known to be current' : 'earlier';
  if (ties.length === 0) return 'No player from these rosters found';
  if (other === 0) return plural(current, 'current player');
  if (current === 0) return other === 1 ? `1 player, ${otherWords}` : `${plural(other, 'player')}, all ${otherWords}`;
  return `${plural(ties.length, 'player')}: ${current} current, ${other} ${otherWords}`;
}

/** `/clubs`: every club, grouped by region, each with its tied players' counts and schools. */
export function buildClubsIndexView(): ClubsIndexView {
  const file = getClubsFile();
  const clubs = getClubs();
  const trackedTeams = getRosters().teams.length;

  const rows: Array<{ club: Club; row: ClubIndexRow }> = clubs.map((club) => {
    const ties = getClubAffiliations(club.slug);
    const current = ties.filter((a) => a.status === 'current').length;
    return {
      club,
      row: {
        slug: club.slug,
        href: `/clubs/${club.slug}`,
        name: clubDisplayName(club),
        subline: [club.shortName !== null ? club.name : null, club.city].filter(Boolean).join(' · ') || null,
        current,
        other: ties.length - current,
        countLine: countLine(ties),
        schools: [...new Set(ties.map((a) => schoolName(a.teamSlug)))].sort((a, b) => a.localeCompare(b)),
      },
    };
  });

  const regions: ClubRegionGroup[] = CLUB_REGIONS.flatMap((id) => {
    const inRegion = rows.filter((r) => r.club.region === id).map((r) => r.row);
    return inRegion.length === 0
      ? []
      : [{ id, heading: REGION_WORDS[id].label, meta: plural(inRegion.length, 'club'), clubs: inRegion }];
  });
  const empty = SEARCHED_REGIONS.filter((r) => !clubs.some((c) => c.region === r));

  const playerCount = new Set(file.affiliations.map((a) => `${a.teamSlug} ${a.athleteId}`)).size;
  const schoolCount = new Set(file.affiliations.map((a) => a.teamSlug)).size;
  const withPlayers = rows
    .map((r) => r.row)
    .filter((r) => r.current + r.other > 0)
    .sort((a, b) => b.current + b.other - (a.current + a.other) || a.name.localeCompare(b.name));

  return {
    lede: lede(trackedTeams, playerCount, schoolCount, clubs.length, withPlayers),
    regions,
    regionsWithoutClubs: empty.map((r) => REGION_WORDS[r].label),
    regionsWithoutClubsSentence: empty.length > 0 ? `This list has no club based ${basedWords(empty)}.` : null,
    trackedTeams,
    playerCount,
    schoolCount,
    clubCount: clubs.length,
    clubsWithPlayers: withPlayers.length,
    capturedOn: dateWithYear(file.capturedAt),
    currentSeasons: currentSeasons(file.season),
  };
}

/** "26-27" → "2025-26 or 2026-27". */
function currentSeasons(season: string): string {
  const end = 2000 + Number(season.slice(3, 5));
  const words = (y: number) => `${y - 1}-${String(y).slice(2)}`;
  return `${words(end - 1)} or ${words(end)}`;
}

/** The page's one-paragraph answer: what it lists, then how many, and where most of them play. */
function lede(
  trackedTeams: number,
  players: number,
  schools: number,
  clubCount: number,
  withPlayers: ClubIndexRow[],
): string {
  const opening = `Which youth clubs players on this site’s ${trackedTeams} varsity rosters play for, or played for, according to public pages that name both.`;
  const count = (r: ClubIndexRow) => `${r.name} (${r.current + r.other})`;
  const who = `${plural(players, 'player')} from ${plural(schools, 'school')} ${players === 1 ? 'is' : 'are'} tied to`;
  if (withPlayers.length === 0) return `${opening} No public page we found ties a player here to one of these ${clubCount} clubs yet.`;
  if (withPlayers.length === 1) return `${opening} ${who} one of these ${clubCount} clubs, ${count(withPlayers[0])}.`;
  return `${opening} ${who} ${withPlayers.length} of these ${clubCount} clubs, the most to ${count(withPlayers[0])} and ${count(withPlayers[1])}.`;
}

// ---------------------------------------------------------------- /clubs/[slug]

export interface ClubPlayerRow {
  key: string;
  /** The roster row's own spelling. */
  name: string;
  /** The registry name, and `/teams/<slug>#roster`. */
  school: { name: string; href: string };
  /** The grade (in words) and the club team, only those that exist. */
  facts: string[];
  /** statusWords(): "Current, as of Jul 8, 2026", "Listed by NCSA, 2025". */
  status: string;
  statusKind: AffiliationStatus;
  /** Every page the tie rests on, each URL once, in the file's order. */
  sources: ClubSourceLink[];
}

export interface ClubPlayerGroup {
  id: 'current' | 'other';
  /** "Current", "Earlier", or "Earlier, or not known to be current" when a tie is `unknown`. */
  heading: string;
  rows: ClubPlayerRow[];
}

export interface ClubHostLink extends ClubSourceLink {
  /** "sfyouthfieldhockey.com", printed after the link. */
  host: string;
}

export interface ClubProgramRow {
  key: string;
  name: string;
  detail: string | null;
  /** The page the program was read from; null when it is the shared one, linked once under the list. */
  source: ClubSourceLink | null;
}

/**
 * The page several of a club's programs were read from (Fly lists all eight on one page), linked
 * once under the list rather than on each of their rows.
 */
export interface ClubProgramsSource extends ClubSourceLink {
  /** "Listed on the club’s site", or, when some rows keep a link, which rows it covers. */
  lead: string;
}

export interface ClubPageView {
  slug: string;
  /** The display name: the h1. */
  name: string;
  /** The full name under it, when the display name is a short one. */
  fullName: string | null;
  /** "South Bay"; null for `elsewhere`, or when it says the same as the city ("San Francisco"). */
  regionLabel: string | null;
  /** The city and the founding year, when known: ["Los Altos", "Founded 2001"]. */
  facts: string[];
  website: string | null;
  description: string;
  /** Current first, then the rest; [] when no tracked player is tied to the club. */
  groups: ClubPlayerGroup[];
  playerCount: number;
  programs: ClubProgramRow[];
  /** The page most programs were read from, when two or more were; null otherwise. */
  programsSource: ClubProgramsSource | null;
  /** The club's own roster pages: linked instead of naming players who are not tracked here. */
  rosterPages: ClubHostLink[];
  /**
   * The other pages the club record was read from, by the record's short name for each ("Program
   * overview"). A roster page is linked once, under the rosters, not again here.
   */
  sources: ClubHostLink[];
  trackedTeams: number;
  /** "Oct 3, 2026" */
  checkedOn: string;
}

/**
 * A program's link text: "club site" on the club's own host, "SportsRecruits team page" for a
 * SportsRecruits team, otherwise the host.
 */
function programSourceLabel(url: string, club: Club): string {
  const host = hostOf(url);
  if (club.website && host === hostOf(club.website)) return 'club site';
  if (isSportsRecruits(host) && pathOf(url).includes('/organization/')) return 'SportsRecruits team page';
  return host;
}

/** Where a page sits, for a sentence: "the club’s site", "SportsRecruits", otherwise the host. */
function placeOf(url: string, club: Club): string {
  const host = hostOf(url);
  if (club.website && host === hostOf(club.website)) return 'the club’s site';
  if (isSportsRecruits(host)) return 'SportsRecruits';
  return host;
}

/**
 * The page the most programs were read from, when at least two were (a tie goes to the page cited
 * first). Every row it covers drops its own link, so Fly's eight rows do not each say "club site";
 * a row read from any other page keeps one. Its link text is the club record's name for the page
 * ("Programs overview"), else the host.
 */
function sharedProgramSource(club: Club): ClubProgramsSource | null {
  const counts = new Map<string, number>();
  for (const p of club.programs) counts.set(p.source, (counts.get(p.source) ?? 0) + 1);
  let url: string | null = null;
  for (const [u, n] of counts) if (n >= 2 && (url === null || n > counts.get(url)!)) url = u;
  if (url === null) return null;
  const where = placeOf(url, club);
  return {
    label: club.sources.find((s) => s.url === url)?.what ?? hostOf(url),
    url,
    lead:
      counts.get(url) === club.programs.length
        ? `Listed on ${where}`
        : `Programs without a link of their own are listed on ${where}`,
  };
}

/**
 * A roster page's link text, first match wins: the program it is the roster of ("U19 Hawks Blue
 * roster"); what the club's sources say it is, up to the first ": " ("Current players");
 * "Club roster page" on the club's own host; "SportsRecruits team page"; otherwise the host. Each
 * stands alone on its line, beside the club's own names for its pages, so each is capitalized
 * as those are.
 */
function rosterPageLabel(url: string, club: Club): string {
  const program = club.programs.find((p) => p.source === url);
  if (program) return `${program.name} roster`;
  const source = club.sources.find((s) => s.url === url);
  if (source) {
    const cut = source.what.indexOf(': ');
    return cut > 0 ? source.what.slice(0, cut) : source.what;
  }
  const host = hostOf(url);
  if (club.website && host === hostOf(club.website)) return 'Club roster page';
  if (isSportsRecruits(host) && pathOf(url).includes('/organization/')) return 'SportsRecruits team page';
  return host;
}

function playerRow(a: ClubAffiliation, club: Club): ClubPlayerRow {
  const row = getAffiliatedPlayer(a);
  const seen = new Set<string>();
  const sources = a.sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  return {
    key: `${a.teamSlug}-${a.athleteId}`,
    name: row.fullName,
    school: { name: schoolName(a.teamSlug), href: `/teams/${a.teamSlug}#roster` },
    facts: [row.grade !== null ? gradeWord(row.grade) : null, a.clubTeam].filter((f): f is string => f !== null),
    status: statusWords(a, club),
    statusKind: a.status,
    sources: numbered(sources.map((s) => ({ label: sourceLabel(s, club), url: s.url }))),
  };
}

/** One club's page. null for a slug data/clubs.json does not hold. */
export function buildClubPageView(slug: string): ClubPageView | null {
  const club = getClub(slug);
  if (!club) return null;
  const name = clubDisplayName(club);

  // School, then the roster's own name order (lib/rosters.ts sortedPlayers' byName).
  const ties = [...getClubAffiliations(slug)]
    .map((a) => ({ a, p: getAffiliatedPlayer(a), school: schoolName(a.teamSlug) }))
    .sort(
      (x, y) =>
        x.school.localeCompare(y.school) ||
        (x.p.lastName ?? x.p.fullName).localeCompare(y.p.lastName ?? y.p.fullName) ||
        x.p.fullName.localeCompare(y.p.fullName),
    )
    .map(({ a }) => a);
  const current = ties.filter((a) => a.status === 'current');
  const other = ties.filter((a) => a.status !== 'current');
  const groups: ClubPlayerGroup[] = [];
  if (current.length > 0) groups.push({ id: 'current', heading: 'Current', rows: current.map((a) => playerRow(a, club)) });
  if (other.length > 0) {
    groups.push({
      id: 'other',
      heading: other.some((a) => a.status === 'unknown') ? 'Earlier, or not known to be current' : 'Earlier',
      rows: other.map((a) => playerRow(a, club)),
    });
  }

  const region = REGION_WORDS[club.region].label;
  const shared = sharedProgramSource(club);
  return {
    slug: club.slug,
    name,
    fullName: club.shortName !== null ? club.name : null,
    regionLabel: club.region === 'elsewhere' || region === club.city ? null : region,
    facts: [club.city, club.founded !== null ? `Founded ${club.founded}` : null].filter((f): f is string => f !== null),
    website: club.website,
    description: club.description,
    groups,
    playerCount: ties.length,
    programs: club.programs.map((p, i) => ({
      key: `${i}-${p.name}`,
      name: p.name,
      detail: p.detail,
      source: p.source === shared?.url ? null : { label: programSourceLabel(p.source, club), url: p.source },
    })),
    programsSource: shared,
    rosterPages: numbered(club.rosterPages.map((url) => ({ label: rosterPageLabel(url, club), url, host: hostOf(url) }))),
    sources: club.sources
      .filter((s) => !club.rosterPages.includes(s.url))
      .map((s) => ({ label: s.what, url: s.url, host: hostOf(s.url) })),
    trackedTeams: getRosters().teams.length,
    checkedOn: dateWithYear(club.checkedOn),
  };
}
