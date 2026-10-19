/**
 * The SCVAL 2025-26 end-of-season PDFs (standings and all-league awards): the only source of
 * prior-season SCVAL data. Read once a year by scripts/build-history.ts (ScvalClient), which writes
 * data/history-2025-26.json.
 */

import type { DivisionId, TeamSlug } from '@/lib/model/ids';
import { resolveTeam } from '@/lib/registry/resolve';
import { HttpClient, type HttpClientOptions } from '@/lib/sources/http/client';
import { pdfToText } from './pdftotext';

/**
 * The 2025-26 end-of-season PDFs — the only source of prior-season data, because MaxPreps' league
 * URL year segment is cosmetic and always serves the CURRENT table (SPEC §1.1h gotcha).
 * Published once a year; `scripts/build-history.ts` turns them into data/history-2025-26.json.
 */
export const SCVAL_HISTORY_PDFS = {
  standings: 'https://www.scval.com/standings/2025-26%20Field%20Hockey%20standings.pdf',
  allLeague: 'https://www.scval.com/standings/SCVAL%202025-26%20Field%20Hockey%20all%20league.pdf',
} as const;

export type ScvalLevel = 'varsity' | 'jv';

export interface HistoryStandingRow {
  /** 1-based, the PDF's own "SCHOOL by finish" order. NOT a recomputed ranking. */
  place: number;
  /** Verbatim PDF spelling, which differs from MaxPreps' ("St. Francis" vs "Saint Francis"). */
  name: string;
  slug: TeamSlug | null;
  /** "11-0-1" as printed. */
  leagueRecord: string;
  w: number;
  l: number;
  t: number;
  /** The "Overall record" column is EMPTY in the 25-26 file, so this is always null. */
  overallRecord: null;
}

export interface HistoryStandingsBlock {
  division: DivisionId;
  level: ScvalLevel;
  rows: HistoryStandingRow[];
}

/** `Field Hockey   DeAnza  V  St. Ignatius  11-0-1` — the first row carries the block header. */
const HISTORY_HEAD_RE =
  /^Field Hockey\s+(DeAnza|El Camino)\s+(JV|V)\s+(.*?[A-Za-z.])\s{2,}(\d+-\d+(?:-\d+)?)\s*$/;
/** Subsequent rows are an indented school + record pair. */
const HISTORY_ROW_RE = /^\s+(.*?[A-Za-z.])\s{2,}(\d+-\d+(?:-\d+)?)\s*$/;

function toRecord3(record: string): { w: number; l: number; t: number } {
  const parts = record.split('-').map(Number);
  return { w: parts[0] ?? 0, l: parts[1] ?? 0, t: parts[2] ?? 0 };
}

/**
 * Parse the end-of-season standings PDF: four stacked blocks in the order
 * DeAnza V, El Camino V, DeAnza JV, El Camino JV. `division` is literally `DeAnza` (no space).
 *
 * ⚠️ JV membership differs from varsity — DA JV omits Valley Christian and Wilcox, EC JV omits
 * Saratoga and Presentation — so a JV table must never assume the varsity 16.
 */
export function parseStandingsPdfText(text: string): HistoryStandingsBlock[] {
  const blocks: HistoryStandingsBlock[] = [];
  let current: HistoryStandingsBlock | null = null;
  const push = (block: HistoryStandingsBlock, name: string, record: string) => {
    const team = resolveTeam(name);
    const r = toRecord3(record);
    block.rows.push({
      place: block.rows.length + 1,
      name,
      slug: team?.slug ?? null,
      leagueRecord: record,
      ...r,
      overallRecord: null,
    });
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const head = HISTORY_HEAD_RE.exec(line);
    if (head) {
      current = {
        division: head[1] === 'DeAnza' ? 'de-anza' : 'el-camino',
        level: head[2] === 'V' ? 'varsity' : 'jv',
        rows: [],
      };
      blocks.push(current);
      push(current, head[3].trim(), head[4]);
      continue;
    }
    if (!current) continue;
    const row = HISTORY_ROW_RE.exec(line);
    if (row) push(current, row[1].trim(), row[2]);
  }
  return blocks;
}

export interface AllLeaguePlayer {
  player: string;
  /** Verbatim PDF spelling. Inconsistent even within one file ("St Ignatius" / "Saint Ignatius"). */
  school: string;
  slug: TeamSlug | null;
  position: string;
  /** Grade year, 9-12. */
  year: number;
}

export interface AllLeagueAward {
  award: string;
  /**
   * The right-hand side, VERBATIM. Deliberately unparsed: De Anza writes
   * "St Ignatius- Olivia Van de Braak" while El Camino writes "Leaya Cleary Los Gatos 12" and
   * "Trishna Sinha, Goalie, Lynbrook". Splitting those three shapes would mean guessing.
   */
  value: string;
}

export interface AllLeagueBlock {
  division: DivisionId;
  level: ScvalLevel;
  overall: AllLeagueAward[];
  firstTeam: AllLeaguePlayer[];
  secondTeam: AllLeaguePlayer[];
  honorableMention: AllLeaguePlayer[];
}

const AWARD_RE = /^([A-Za-z ]+(?:of the Year|Player)):\s*(.*)$/;
/**
 * `Player | school | position | year`, whitespace-aligned. The leading indent varies WITHIN one
 * table (some rows sit at column 0), so it is not anchored on indentation.
 */
const ALL_LEAGUE_ROW_RE = /^\s*(\S.*?)\s{2,}(\S.*?)\s{2,}(\S.*?)\s{2,}(\d{1,2})\s*$/;

/**
 * Parse the all-league awards PDF: four blocks (DeAnza V, DeAnza JV, El Camino V, El Camino JV),
 * each an `OVERALL LEAGUE AWARDS:` list (varsity only) then First team / Second team / HM tables.
 *
 * Rows whose player cell is blank — a school that submitted no name, printed as a lone school name —
 * are skipped rather than turned into a player called nothing.
 */
export function parseAllLeaguePdfText(text: string): AllLeagueBlock[] {
  const blocks: AllLeagueBlock[] = [];
  let current: AllLeagueBlock | null = null;
  let bucket: 'overall' | 'firstTeam' | 'secondTeam' | 'honorableMention' | null = null;

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const divisionMatch = /All League Team (DeAnza|El Camino)/.exec(line);
    if (divisionMatch) {
      current = {
        division: divisionMatch[1] === 'DeAnza' ? 'de-anza' : 'el-camino',
        // Varsity blocks say "Varsity Field Hockey"; JV blocks say "Junior Varsity/Field Hockey".
        level: 'varsity',
        overall: [],
        firstTeam: [],
        secondTeam: [],
        honorableMention: [],
      };
      blocks.push(current);
      bucket = null;
      continue;
    }
    if (!current) continue;
    if (/Junior Varsity\/Field Hockey/.test(line)) current.level = 'jv';
    if (/OVERALL LEAGUE AWARDS/.test(line)) {
      bucket = 'overall';
      continue;
    }
    if (/^First team\s*$/.test(line)) {
      bucket = 'firstTeam';
      continue;
    }
    if (/^Second team\s*$/.test(line)) {
      bucket = 'secondTeam';
      continue;
    }
    if (/^(HM|Honorable|Honorable mention|mention)\s*$/.test(line)) {
      bucket = 'honorableMention';
      continue;
    }
    // The repeated column-header row.
    if (/^\s*Player\s{2,}school/i.test(line)) continue;
    if (bucket === 'overall') {
      const award = AWARD_RE.exec(line.trim());
      if (award) {
        // "Coach of the Year:" is printed with nothing after it.
        if (award[2].trim()) current.overall.push({ award: award[1].trim(), value: award[2].trim() });
        continue;
      }
    }
    if (!bucket || bucket === 'overall') continue;
    const row = ALL_LEAGUE_ROW_RE.exec(line);
    if (!row) continue;
    const team = resolveTeam(row[2].trim());
    current[bucket].push({
      player: row[1].trim(),
      school: row[2].trim(),
      slug: team?.slug ?? null,
      position: row[3].trim(),
      year: Number(row[4]),
    });
  }
  return blocks;
}

export class ScvalClient {
  private readonly http: HttpClient;

  constructor(opts: HttpClientOptions = {}) {
    this.http = new HttpClient(opts);
  }

  /**
   * The prior-season PDFs, for scripts/build-history.ts, which is why this class exists. The live
   * grid and standings-index reads go through LiveTransport ('scval-pdf-text', 'scval-standings-index').
   */
  async getHistory(): Promise<{
    standings: HistoryStandingsBlock[];
    allLeague: AllLeagueBlock[];
    urls: typeof SCVAL_HISTORY_PDFS;
  }> {
    const standings = await this.http.bytes(SCVAL_HISTORY_PDFS.standings);
    const allLeague = await this.http.bytes(SCVAL_HISTORY_PDFS.allLeague);
    return {
      standings: parseStandingsPdfText(pdfToText(standings.body)),
      allLeague: parseAllLeaguePdfText(pdfToText(allLeague.body)),
      urls: SCVAL_HISTORY_PDFS,
    };
  }
}
