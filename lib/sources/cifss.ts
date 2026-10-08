/**
 * cifsshome.org's schedule-and-score widget (the CIF Southern Section's HomeCampus site), read as a
 * score CROSS-CHECK only (docs/DATA-SOURCES.md §1.2a). Nothing it says reaches a published score,
 * record or standings order: lib/cifss-crosscheck.ts compares it with MaxPreps and lists the
 * differences on /about.
 *
 * The widget is one server-rendered HTML table per (Section, school year, sport), 20 rows a page:
 *
 *   https://www.cifsshome.org/widget/schedule-score?section_id=4&year=2026&sport_id=30
 *     &date_from=08/01/2026&date_to=10/07/2026&page=2
 *
 * Schools enter their own schedules and scores there, so coverage is school by school: a game can be
 * missing, listed by both schools (two rows), or left on its first date after a reschedule. Each
 * row is one game: Sport, Home, Facility, Home Division, Home Score, Away, Away Division, Away Score,
 * Date (MM/DD/YYYY), Time, Game Type, Notes. A school from another Section carries its Section in
 * parentheses ("Christopher (Central Coast Section)"); one Section's listing never names its own.
 *
 * Team identity is Section-scoped: a bare name in a Section's listing resolves only to one of our
 * teams in that Section, so the North Coast Section's own Del Norte is never read as San Diego's.
 */

import { SEASON_CALENDAR_YEAR } from '../season';
import { getTeamBySlug, normalizeTeamKey, resolveTeam } from '../teams';
import type { Team, TeamSlug } from '../types';
import { htmlUnescape } from './http';

export const CIFSS_WIDGET_URL = 'https://www.cifsshome.org/widget/schedule-score';

/** The widget's sport id for field hockey (its Sport select: "Field Hockey" = 30). */
export const CIFSS_FIELD_HOCKEY_SPORT_ID = 30;

/** The widget's school-year id: the fall calendar year (2026 = "2026-27"). */
export const CIFSS_YEAR = Number(SEASON_CALENDAR_YEAR);

/** The first date of the season window read (no field hockey game is played before it). */
export const CIFSS_SEASON_FROM = `${SEASON_CALENDAR_YEAR}-08-01`;

/** The Sections our teams play in, as the widget names and numbers them. */
export const CIFSS_SECTIONS = [
  { key: 'ccs', sectionId: 4, name: 'Central Coast Section' },
  { key: 'ncs', sectionId: 7, name: 'North Coast Section' },
  { key: 'ns', sectionId: 8, name: 'Northern Section' },
  { key: 'sjs', sectionId: 5, name: 'SAC-Joaquin Section' },
  { key: 'ss', sectionId: 1, name: 'Southern Section' },
  { key: 'sds', sectionId: 3, name: 'San Diego Section' },
] as const;

export type CifssSectionKey = (typeof CIFSS_SECTIONS)[number]['key'];

/**
 * Our teams whose CIF Section is not the registry's `section` (the Section of the league they play
 * in): Davis and Bella Vista are Sac-Joaquin Section schools in the EAL (lib/registry/eal.ts).
 */
export const CIFSS_SECTION_OVERRIDES: Readonly<Record<TeamSlug, CifssSectionKey>> = {
  davis: 'sjs',
  'bella-vista': 'sjs',
};

/**
 * Schools the widget lists as "(No Section)", by normalized name. Only these resolve; any other
 * no-Section school (Hockaday, Garrison Forest) is an out-of-state opponent and stays a name.
 * Stevenson's own rows say "Stevenson School"; its opponents' rows sometimes say "Stevenson (No Section)".
 */
export const CIFSS_NO_SECTION_TEAMS: Readonly<Record<string, TeamSlug>> = {
  stevenson: 'stevenson',
};

/** The widget's Section of one of our teams. */
export function cifssSectionOf(team: Pick<Team, 'slug' | 'section'>): CifssSectionKey {
  return CIFSS_SECTION_OVERRIDES[team.slug] ?? team.section;
}

function dateParam(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  return `${m}/${d}/${y}`;
}

/** One page of a Section's field hockey listing, dated `from` through `to` (YYYY-MM-DD, inclusive). */
export function cifssListingUrl(section: CifssSectionKey, opts: { from: string; to: string; page?: number }): string {
  const s = CIFSS_SECTIONS.find((x) => x.key === section);
  if (!s) throw new Error(`lib/sources/cifss.ts: unknown section ${section}`);
  const params = new URLSearchParams({
    section_id: String(s.sectionId),
    year: String(CIFSS_YEAR),
    sport_id: String(CIFSS_FIELD_HOCKEY_SPORT_ID),
    date_from: dateParam(opts.from),
    date_to: dateParam(opts.to),
  });
  if (opts.page !== undefined && opts.page > 1) params.set('page', String(opts.page));
  return `${CIFSS_WIDGET_URL}?${params.toString()}`;
}

/** One side of a widget row: the name as printed (Section suffix removed), our team if it resolves, its score. */
export interface CifssSide {
  name: string;
  slug: TeamSlug | null;
  score: number | null;
}

export interface CifssRow {
  /** The widget's row id (`<tr id>`). */
  cifssId: string;
  /** The Section listing the row was read from. */
  section: CifssSectionKey;
  dateKey: string;
  home: CifssSide;
  away: CifssSide;
  /** "League", "Non-League", "Tournament", "Playoffs", "State/Regional", "Wildcard". */
  gameType: string;
  /** The row's Event Notes text, null when it has none ("N/A" counts as none). */
  note: string | null;
}

export interface CifssPage {
  rows: CifssRow[];
  /** Every game row the page lists, the skipped ones (a TBA opponent) included. */
  listed: number;
  /** The highest page number the pagination links name (1 when there is one page). */
  lastPage: number;
}

const SECTION_BY_NAME = new Map<string, CifssSectionKey | 'none'>([
  ...CIFSS_SECTIONS.map((s) => [normalizeTeamKey(s.name), s.key] as [string, CifssSectionKey]),
  [normalizeTeamKey('No Section'), 'none'],
]);

function cellText(html: string): string {
  return htmlUnescape(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * One printed name → the side's name and our team. "Edison/HB", "San Marcos/San Marcos" and
 * "El Capitan/Lakeside" carry the school's city after a slash; it is dropped before resolving.
 */
export function resolveCifssName(raw: string, listing: CifssSectionKey): { name: string; slug: TeamSlug | null } | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || /^tba$/i.test(text)) return null;
  const suffixed = /^(.*?)\s*\(([^)]*)\)$/.exec(text);
  const printed = (suffixed ? suffixed[1] : text).trim();
  // A Section the widget names that is none of ours (Los Angeles City, Oakland, an out-of-state
  // association) resolves to no team of ours.
  const section: CifssSectionKey | 'none' | 'other' = suffixed
    ? (SECTION_BY_NAME.get(normalizeTeamKey(suffixed[2])) ?? 'other')
    : listing;
  const base = printed.replace(/\/.*$/, '').trim();
  let slug: TeamSlug | null = null;
  if (section === 'none') {
    slug = CIFSS_NO_SECTION_TEAMS[normalizeTeamKey(base)] ?? null;
  } else if (section !== 'other') {
    const team = resolveTeam(base);
    slug = team && cifssSectionOf(team) === section ? team.slug : null;
  }
  return { name: slug ? (getTeamBySlug(slug)?.name ?? base) : base, slug };
}

function score(cell: string): number | null {
  const t = cellText(cell);
  return /^\d{1,3}$/.test(t) ? Number(t) : null;
}

function dateKeyOfCell(cell: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cellText(cell));
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/**
 * One listing page → its rows and the last page number. A row with an unnamed side ("TBA") or no
 * readable date is skipped; `onSkip` hears why. Throws when the page carries no listing table (its
 * "Home Score" and "Away Score" column heads): a challenge or error page served with HTTP 200 is a
 * failed read, never an empty listing. A listing with no games still carries the heads.
 */
export function parseCifssPage(html: string, section: CifssSectionKey, onSkip?: (message: string) => void): CifssPage {
  if (!/<th\b[^>]*>\s*Home Score\s*<\/th>/i.test(html) || !/<th\b[^>]*>\s*Away Score\s*<\/th>/i.test(html)) {
    throw new Error('not a cifsshome.org listing: no Home Score / Away Score table heads');
  }
  const rows: CifssRow[] = [];
  let listed = 0;
  for (const m of html.matchAll(/<tr id="(\d+)">([\s\S]*?)<\/tr>/g)) {
    listed += 1;
    const id = m[1];
    const body = m[2];
    const modal = /class="modal-body[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(body);
    // The notes cell holds a modal; the eleven cells before it are the row.
    const cells = [...body.replace(/<div class="modal[\s\S]*$/, '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    if (cells.length < 11) {
      onSkip?.(`row ${id}: ${cells.length} cells, expected 12`);
      continue;
    }
    if (!/field hockey/i.test(cellText(cells[0]))) continue;
    const dateKey = dateKeyOfCell(cells[8]);
    const home = resolveCifssName(cellText(cells[1]), section);
    const away = resolveCifssName(cellText(cells[5]), section);
    if (!dateKey) {
      onSkip?.(`row ${id}: unreadable date "${cellText(cells[8])}"`);
      continue;
    }
    if (!home || !away) continue; // a TBA opponent: nothing to compare
    const noteText = modal ? cellText(modal[1]) : '';
    rows.push({
      cifssId: id,
      section,
      dateKey,
      home: { ...home, score: score(cells[4]) },
      away: { ...away, score: score(cells[7]) },
      gameType: cellText(cells[10]),
      note: noteText && !/^n\/?a$/i.test(noteText) ? noteText : null,
    });
  }
  const pages = [...html.matchAll(/[?&](?:amp;)?page=(\d+)/g)].map((p) => Number(p[1]));
  return { rows, listed, lastPage: Math.max(1, ...pages) };
}
