/**
 * The /clubs/[slug] page's shapes and rows: the tied players with the pages each tie rests on, the
 * club's programs and the source a program list was read from. `buildClubPageView`
 * (views/clubs/club-view.ts) assembles them.
 */

import { getAffiliatedPlayer } from '@/lib/datasets/clubs';
import type { AffiliationStatus, Club, ClubAffiliation } from '@/lib/schema/clubs';
import { gradeWord } from '@/lib/format/words';
import { teamHref } from '@/lib/shared/routes';
import { hostOf, isSportsRecruits, numbered, pathOf, schoolName } from '@/views/shared/source-links';

import { isOwnSite, sourceLabel, statusWords } from './words';

export interface ClubSourceLink {
  label: string;
  url: string;
}

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
export function programSourceLabel(url: string, club: Club): string {
  const host = hostOf(url);
  if (isOwnSite(url, club)) return 'club site';
  if (isSportsRecruits(host) && pathOf(url).includes('/organization/')) return 'SportsRecruits team page';
  return host;
}

/** Where a page sits, for a sentence: "the club’s site", "SportsRecruits", otherwise the host. */
function placeOf(url: string, club: Club): string {
  const host = hostOf(url);
  if (isOwnSite(url, club)) return 'the club’s site';
  if (isSportsRecruits(host)) return 'SportsRecruits';
  return host;
}

/**
 * The page the most programs were read from, when at least two were (a tie goes to the page cited
 * first). Every row it covers drops its own link, so Fly's eight rows do not each say "club site";
 * a row read from any other page keeps one. Its link text is the club record's name for the page
 * ("Programs overview"), else the host.
 */
export function sharedProgramSource(club: Club): ClubProgramsSource | null {
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
export function rosterPageLabel(url: string, club: Club): string {
  const program = club.programs.find((p) => p.source === url);
  if (program) return `${program.name} roster`;
  const source = club.sources.find((s) => s.url === url);
  if (source) {
    const cut = source.what.indexOf(': ');
    return cut > 0 ? source.what.slice(0, cut) : source.what;
  }
  const host = hostOf(url);
  if (isOwnSite(url, club)) return 'Club roster page';
  if (isSportsRecruits(host) && pathOf(url).includes('/organization/')) return 'SportsRecruits team page';
  return host;
}

export function playerRow(a: ClubAffiliation, club: Club): ClubPlayerRow {
  const row = getAffiliatedPlayer(a);
  const seen = new Set<string>();
  const sources = a.sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  return {
    key: `${a.teamSlug}-${a.athleteId}`,
    name: row.fullName,
    school: { name: schoolName(a.teamSlug), href: `${teamHref(a.teamSlug)}#roster` },
    facts: [row.grade !== null ? gradeWord(row.grade) : null, a.clubTeam].filter((f): f is string => f !== null),
    status: statusWords(a, club),
    statusKind: a.status,
    sources: numbered(sources.map((s) => ({ label: sourceLabel(s, club), url: s.url }))),
  };
}
