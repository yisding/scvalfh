/**
 * OFFICIAL source for BVAL's prior season (2025-26): the league's own standings Google Sheet and
 * its two all-league documents, all linked from bval.org. Used by scripts/build-history.ts only,
 * never by the daily cron.
 *
 *   https://bval.org/standings/   -> "Field Hockey (Girls)" 2025-26 -> the Sheet below
 *   https://bval.org/all-league/  -> "2025-26 ALL-LEAGUE AWARDS" -> Field Hockey: Mt. Hamilton, Santa Teresa
 *
 * Facts verified against the live files on 2026-10-03:
 *   - the sheet exports as CSV without auth. Two stacked blocks (division label row, header row,
 *     one row per school): Place, School, Overall, League Record, JV Place, JV Record. No points,
 *     no goals. Records are written "13 - 2 - 1"; Sobrato's is "4 - 6" with no ties field.
 *   - the two all-league Google Docs export as HTML tables (txt export loses the empty cells, which
 *     is how a blank position differs from a missing column). First/Second team rows carry
 *     name / year / school / position; a school that submitted nobody is a row with only a school.
 *   - Santa Teresa writes the year as a word ("Senior", "Sophmore" sic); Mt. Hamilton as a number.
 */

import { BASIC_NAMED, decodeEntities } from './html-entities';
import { divisionsOf } from '../leagues';
import { resolveOfficialName, teamsInLeague } from '../teams';
import type { DivisionId, TeamSlug } from '../types';

export const BVAL_HISTORY_SOURCES = {
  standingsIndex: 'https://bval.org/standings/',
  allLeagueIndex: 'https://bval.org/all-league/',
  standingsSheet: 'https://docs.google.com/spreadsheets/d/1lXPbU5WJsgr6cpo3sJZBIJBChMXjNC-_/export?format=csv',
  /** The human-facing Sheet (the export URL above is what we fetch). */
  standingsSheetView: 'https://docs.google.com/spreadsheets/d/1lXPbU5WJsgr6cpo3sJZBIJBChMXjNC-_/edit',
  allLeagueDocs: {
    'mt-hamilton': 'https://docs.google.com/document/d/1VWcZOzF2S_3SxvdfbphzmVSnKKiSWA7Q/edit',
    'santa-teresa': 'https://docs.google.com/document/d/198L-AgFIkPY1XX06I9tZjGv38g5fk_a3/edit',
  },
} as const;

/** The `export?format=html` twin of an all-league doc's edit URL. */
export function bvalDocExportUrl(editUrl: string): string {
  return editUrl.replace(/\/edit.*$/, '/export?format=html');
}

export interface BvalStandingRow {
  place: number;
  /** Verbatim sheet spelling. */
  name: string;
  slug: TeamSlug | null;
  /** "8-1-1" as printed, spaces removed. "4-6" stays "4-6": there is no ties field to read. */
  leagueRecord: string;
  w: number;
  l: number;
  /** null when the sheet prints a two-part record: unpublished, NOT assumed to be 0. */
  t: number | null;
  overallRecord: string | null;
}

export interface BvalStandingsBlock {
  division: DivisionId;
  rows: BvalStandingRow[];
  /**
   * The block's JV rows, from its JV Place and JV Record columns, ordered on the JV place (the sheet's row order
   * among equal places): every row whose JV record is a record. `jvUnplaced` names those with a record and no
   * place, so a build can tell a ranked JV table from records alone. Field hockey's build does not store JV.
   */
  jv: BvalStandingRow[];
  jvUnplaced: string[];
}

/** A division as one season's sheet labels it: the label row's text and the id this site files it under. */
export interface BvalSheetDivision {
  id: DivisionId;
  /** The sheet's label row, compared without case ("Santa Teresa - North"). */
  sheetLabel: string;
}

/**
 * Where BVAL keeps each sport's 2025-26 final standings: the Google Sheet bval.org/standings links (the CSV export
 * of its standings tab is what the build reads), and the season's divisions as the sheet labels them. Field
 * hockey's is `BVAL_HISTORY_SOURCES` above, with its all-league documents; these sheets were given by the owner on
 * 2026-11-16 and their all-league documents are not transcribed.
 *
 * The 2025-26 alignments differ from 2026-27's (lib/league-config/<sport>/bval.ts):
 *  - girls soccer: the same three divisions, with different members;
 *  - boys basketball: Mt. Hamilton, Santa Teresa - North, Santa Teresa - South and West Valley. The two Santa
 *    Teresa divisions no longer exist (2026-27 has Santa Teresa and Almaden Valley), so they are filed under ids
 *    of their own;
 *  - girls volleyball: Mt. Hamilton, Santa Teresa and West Valley, three where 2026-27 has four (Almaden Valley).
 */
export interface BvalSeasonSheet {
  title: string;
  sheetId: string;
  gid: string;
  divisions: ReadonlyArray<BvalSheetDivision & { label: string; past: boolean }>;
}

export const BVAL_SEASON_SHEETS: Readonly<Record<'soccer' | 'basketball' | 'volleyball', BvalSeasonSheet>> = {
  soccer: {
    title: 'BVAL Girls Soccer / 2025 - 26 Team Standings',
    sheetId: '1KdPgTSbacBwGPtTHFIUqab6-BP3EPD68',
    gid: '1950531199',
    divisions: [
      { id: 'mt-hamilton', sheetLabel: 'Mt. Hamilton', label: 'Mt. Hamilton', past: false },
      { id: 'santa-teresa', sheetLabel: 'Santa Teresa', label: 'Santa Teresa', past: false },
      { id: 'west-valley', sheetLabel: 'West Valley', label: 'West Valley', past: false },
    ],
  },
  basketball: {
    title: 'BVAL Boys Basketball / 2025 - 26 Team Standings',
    sheetId: '1FsWvfXTqA87Qunf_5-5z0zYmDOJTYsqw',
    gid: '182098527',
    divisions: [
      { id: 'mt-hamilton', sheetLabel: 'Mt. Hamilton', label: 'Mt. Hamilton', past: false },
      { id: 'santa-teresa-north', sheetLabel: 'Santa Teresa - North', label: 'Santa Teresa North', past: true },
      { id: 'santa-teresa-south', sheetLabel: 'Santa Teresa - South', label: 'Santa Teresa South', past: true },
      { id: 'west-valley', sheetLabel: 'West Valley', label: 'West Valley', past: false },
    ],
  },
  volleyball: {
    title: 'BVAL Girls Volleyball / 2025 - 26 Team Standings',
    sheetId: '1XsFPR7woftHNAJFQl8OQUNgjBs9_Z6PS',
    gid: '1116204855',
    divisions: [
      { id: 'mt-hamilton', sheetLabel: 'Mt. Hamilton', label: 'Mt. Hamilton', past: false },
      { id: 'santa-teresa', sheetLabel: 'Santa Teresa', label: 'Santa Teresa', past: false },
      { id: 'west-valley', sheetLabel: 'West Valley', label: 'West Valley', past: false },
    ],
  },
};

/** The sheet's CSV export (what the build reads) and its view URL (what the page links). */
export function bvalSheetUrls(sheet: Pick<BvalSeasonSheet, 'sheetId' | 'gid'>): { csv: string; view: string } {
  const base = `https://docs.google.com/spreadsheets/d/${sheet.sheetId}`;
  return { csv: `${base}/export?format=csv&gid=${sheet.gid}`, view: `${base}/edit?gid=${sheet.gid}#gid=${sheet.gid}` };
}

/** Minimal RFC 4180 reader: quoted cells, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** "13 - 2 - 1" -> "13-2-1"; anything that is not a W-L or W-L-T record -> null. */
export function normalizeRecord(cell: string | undefined): string | null {
  const m = /^\s*(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(cell ?? '');
  if (!m) return null;
  return m[3] === undefined ? `${m[1]}-${m[2]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

function splitRecord(record: string): { w: number; l: number; t: number | null } {
  const [w, l, t] = record.split('-').map(Number);
  return { w: w ?? 0, l: l ?? 0, t: t === undefined ? null : t };
}

/** A school name as the sheet or a doc spells it -> a BVAL registry slug (league-scoped). */
export function bvalSlug(name: string): TeamSlug | null {
  return resolveOfficialName('bval', name.trim())?.slug ?? null;
}

/**
 * The sheet's division blocks, in sheet order. The division label row is a row whose only non-empty cell is a
 * division label (`divisions`: the season's, by default the league's current ones, "Mt. Hamilton", "Santa
 * Teresa"); data rows start with a numeric place. Everything else (title rows, the Place/School header) is skipped.
 */
export function parseStandingsCsv(
  text: string,
  divisions: readonly BvalSheetDivision[] = divisionsOf('bval').map((d) => ({ id: d.id, sheetLabel: d.label })),
): BvalStandingsBlock[] {
  const labels = new Map(divisions.map((d) => [d.sheetLabel.trim().toLowerCase(), d.id]));
  const blocks: BvalStandingsBlock[] = [];
  let current: BvalStandingsBlock | null = null;
  for (const cells of parseCsv(text)) {
    const nonEmpty = cells.filter((c) => c.trim() !== '');
    const first = (cells[0] ?? '').trim();
    const division = nonEmpty.length === 1 ? labels.get(first.toLowerCase()) : undefined;
    if (division) {
      current = { division, rows: [], jv: [], jvUnplaced: [] };
      blocks.push(current);
      continue;
    }
    if (!current || !/^\d+$/.test(first)) continue;
    const name = (cells[1] ?? '').trim();
    const leagueRecord = normalizeRecord(cells[3]);
    if (!name || !leagueRecord) continue;
    const slug = bvalSlug(name);
    current.rows.push({
      place: Number(first),
      name,
      slug,
      leagueRecord,
      ...splitRecord(leagueRecord),
      overallRecord: normalizeRecord(cells[2]),
    });
    // JV: a record ("5 - 7") with a whole-number place ("5"; the xlsx's "1.0" is "1" in the CSV). "n/a" or an
    // empty cell is no JV row.
    const jvRecord = normalizeRecord(cells[5]);
    const jvPlace = (cells[4] ?? '').trim();
    if (jvRecord && /^\d+$/.test(jvPlace)) {
      current.jv.push({ place: Number(jvPlace), name, slug, leagueRecord: jvRecord, ...splitRecord(jvRecord), overallRecord: null });
    } else if (jvRecord) {
      current.jvUnplaced.push(name);
    }
  }
  // Ordered on the JV place; Array.prototype.sort is stable, so equal places keep the sheet's order.
  for (const b of blocks) b.jv.sort((a, z) => a.place - z.place);
  return blocks;
}

// ---------------------------------------------------------------- all-league documents

export interface BvalPlayer {
  player: string;
  school: string;
  slug: TeamSlug | null;
  /** null when the cell is empty in the document. */
  position: string | null;
  /** 9-12, from a number or from the word the document wrote. */
  year: number;
}

export interface BvalAward {
  award: string;
  /** "Name, School, Position" from the three cells, joined with ", " — a join, not a guess. */
  value: string;
}

export interface BvalAllLeagueBlock {
  division: DivisionId;
  overall: BvalAward[];
  firstTeam: BvalPlayer[];
  secondTeam: BvalPlayer[];
  honorableMention: BvalPlayer[];
  /** Rows listing a school with no player (the document's own placeholder rows), by team. */
  emptyRows: { team: 'firstTeam' | 'secondTeam'; school: string }[];
}

const YEAR_WORDS: Readonly<Record<string, number>> = {
  freshman: 9,
  sophomore: 10,
  sophmore: 10,
  junior: 11,
  senior: 12,
};

/** "12", "Senior", "Sophmore" (sic) -> 12 / 12 / 10; anything else -> null. */
export function parseGradeYear(cell: string): number | null {
  const t = cell.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 9 && n <= 12 ? n : null;
  }
  return YEAR_WORDS[t.toLowerCase()] ?? null;
}

/**
 * The basic escapes, with the typographic single quotes folded to `'` so a name matches the
 * registry's spelling (`&nbsp;`'s U+00A0 is collapsed with the other whitespace below).
 */
const SHEET_NAMED: ReadonlyMap<string, string> = new Map([...BASIC_NAMED, ['rsquo', "'"], ['lsquo', "'"]]);

/** Every `<tr>` of the document as its cell texts (tags removed, whitespace collapsed). */
export function htmlTableRows(html: string): string[][] {
  const body = html.slice(Math.max(0, html.indexOf('<body')));
  const rows: string[][] = [];
  for (const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      decodeEntities(c[1].replace(/<[^>]+>/g, ' '), SHEET_NAMED).replace(/\s+/g, ' ').trim(),
    );
    rows.push(cells);
  }
  return rows;
}

/**
 * One division's all-league document: the awards table (AWARD / NAME / SCHOOL / POSITION), then
 * FIRST TEAM and SECOND TEAM tables (NAME / YEAR / SCHOOL / POSITION). Rows without a player name
 * are the document's own placeholders for a school that submitted nobody; they are counted, not
 * turned into players.
 */
export function parseAllLeagueHtml(html: string, division: DivisionId): BvalAllLeagueBlock {
  const out: BvalAllLeagueBlock = {
    division,
    overall: [],
    firstTeam: [],
    secondTeam: [],
    honorableMention: [],
    emptyRows: [],
  };
  let section: 'awards' | 'firstTeam' | 'secondTeam' | 'honorableMention' | null = null;
  for (const cells of htmlTableRows(html)) {
    const head = (cells[0] ?? '').toUpperCase();
    if (head === 'AWARD') section = 'awards';
    else if (head === 'FIRST TEAM') section = 'firstTeam';
    else if (head === 'SECOND TEAM') section = 'secondTeam';
    else if (head === 'HONORABLE MENTION') section = 'honorableMention';
    else if (section === 'awards') {
      const [award, name, school, position] = cells;
      if (award && name) {
        out.overall.push({ award, value: [name, school, position].filter(Boolean).join(', ') });
      }
    } else if (section && cells.length >= 4) {
      const [player, yearCell, school, position] = cells;
      if (!player) {
        if (school && (section === 'firstTeam' || section === 'secondTeam')) {
          out.emptyRows.push({ team: section, school });
        }
        continue;
      }
      const year = parseGradeYear(yearCell ?? '');
      if (year === null) throw new Error(`bval all-league ${division}: unreadable year "${yearCell}" for ${player}`);
      out[section].push({
        player,
        school: school ?? '',
        slug: bvalSlug(school ?? ''),
        position: position ? position : null,
        year,
      });
    }
  }
  return out;
}

/** The registry's BVAL slugs, for the build's coverage check. */
export function bvalRegistrySlugs(): string[] {
  return teamsInLeague('bval').map((t) => t.slug);
}
