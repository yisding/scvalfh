/**
 * OFFICIAL source: the two scval.com schedule-grid PDFs (SPEC §1.3).
 *
 * These are the authority for DIVISION ALIGNMENT and for the official league fixture list. They
 * carry no scores and no times beyond the footer's "Varsity 4:00".
 *
 * The De Anza grid still lists Wilcox, which is not fielding a team this season: its fixtures are
 * dropped here and its roster-line entry is not a membership warning (`isWithdrawnSchool(name,
 * league)`, config `withdrawnNames`). Grid spellings resolve through the league scope only
 * (`resolveOfficialName`). The URLs come from config (`getDivision(d).official.scheduleUrl`), and
 * only the live-PDF divisions are parsed (`scvalPdfDivisions()`). The fixture matcher moved to
 * lib/official/match.ts (`matchOfficialFixtures`, matcher 'legacy').
 *
 * Extraction facts, all verified against the live files:
 *   - `http://` 302s to `https://`; redirects must be followed.
 *   - `pdftotext -layout` (poppler-utils). No binary ⇒ the step reports `skipped`, never fails.
 *   - the grid is COLUMN-MAJOR with three date columns per band, so naive line reading interleaves
 *     three different dates. Each matchup is assigned to a column by its character offset.
 *   - the naive "split on 2+ spaces, re-pair on @" approach is broken: `ST. FRANCIS        @   FREMONT`
 *     shatters into `"@"` and `"FREMONT"`. The verified matchup regex below scores 56/56 on both
 *     PDFs with zero bad rows.
 *   - group 1 is AWAY, group 2 is HOME (`ST. FRANCIS @ FREMONT` = St. Francis away at Fremont).
 *   - the Friday Oct 30 column is the crossover block (`DE ANZA #4 VS EL CAMINO #4`, `#1 v. #1`)
 *     and carries no `@`, so it falls out of the matchup regex on its own.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ALL_DIVISIONS, getDivision, leagueOfDivision } from '../leagues';
import { officialDocumentOf, officialFixtureId } from '../official/schema';
import { isWithdrawnSchool, resolveOfficialName, resolveTeam, teamsInDivision } from '../teams';
import type { DivisionId, Game, OfficialFixture, TeamSlug } from '../types';
import { HttpClient, type HttpClientOptions } from './http';

/**
 * The divisions whose official schedule is a live scval.com grid PDF (config: `official.source`
 * 'scval-pdf', mode 'live-pdf'), config order. Every loop in this module and in the official step
 * iterates these ONLY, so a bundled BVAL/PCAL/MCAL division can never be counted as a missing grid.
 */
export function scvalPdfDivisions(): DivisionId[] {
  return ALL_DIVISIONS.filter((d) => d.official.mode === 'live-pdf' && d.official.source === 'scval-pdf').map((d) => d.id);
}

/** The grid PDF of a division, from config (`getDivision(d).official.scheduleUrl`; throws for a division with no schedule document). */
export function scvalScheduleUrl(division: DivisionId): string {
  return officialDocumentOf(division).scheduleUrl;
}

export const SCVAL_FALL_INDEX = 'https://scval.com/fallSports/Fall_index.html';
export const SCVAL_STANDINGS_INDEX = 'https://www.scval.com/standings/';

/** The season the grids belong to. Sep–Oct dates are 2026 (SPEC §1.3). */
export const SCVAL_GRID_YEAR = 2026;

/**
 * The 2025-26 end-of-season PDFs — the only source of prior-season data, because MaxPreps' league
 * URL year segment is cosmetic and always serves the CURRENT table (SPEC §1.1h gotcha).
 * Published once a year; `scripts/build-history.ts` turns them into data/history-2025-26.json.
 */
export const SCVAL_HISTORY_PDFS = {
  standings: 'https://www.scval.com/standings/2025-26%20Field%20Hockey%20standings.pdf',
  allLeague: 'https://www.scval.com/standings/SCVAL%202025-26%20Field%20Hockey%20all%20league.pdf',
} as const;

// ---------------------------------------------------------------- pdftotext

export class PdftotextMissingError extends Error {
  constructor() {
    super('pdftotext (poppler-utils) is not on PATH');
    this.name = 'PdftotextMissingError';
  }
}

let pdftotextChecked: boolean | null = null;

/** Cached probe so the cron only shells out once. */
export function hasPdftotext(): boolean {
  if (pdftotextChecked === null) {
    const probe = spawnSync('pdftotext', ['-v'], { stdio: 'ignore' });
    pdftotextChecked = !probe.error && (probe.status === 0 || probe.status === 99);
  }
  return pdftotextChecked;
}

/** `pdftotext -layout` over a PDF held in memory. Throws PdftotextMissingError when absent. */
export function pdfToText(bytes: Uint8Array): string {
  if (!hasPdftotext()) throw new PdftotextMissingError();
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-pdf-'));
  const file = path.join(dir, 'in.pdf');
  try {
    writeFileSync(file, bytes);
    return execFileSync('pdftotext', ['-layout', file, '-'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- grid parsing

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

/** Matched GLOBALLY on a line — up to three hits, one per date column. */
const DAY_HEADER_RE =
  /(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)[, ]+([A-Z]+)\s+(\d{1,2})\b/g;

/** Group 1 = AWAY, group 2 = HOME. Verified 56/56 rows, 0 bad rows, on both PDFs. */
const MATCHUP_RE = /([A-Z][A-Z. ]*?[A-Z.])\s{1,}@\s{1,}([A-Z][A-Z. ]*?[A-Z.])(?=\s{2,}|\s*$)/g;

/** `Teams: Cupertino, Fremont, …` — the official roster line. */
const TEAMS_LINE_RE = /^\s*Teams:\s*(.+)$/;

/** `DE ANZA DIVISION`, `EL CAMINO DIVISION` — built from the division's config label. */
function divisionHeaderRe(division: DivisionId): RegExp {
  const words = getDivision(division).label.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`${words.join('\\s+')}\\s+DIVISION`, 'i');
}

export interface OfficialSchedule {
  division: DivisionId;
  /** "2026 - 2027" from the page header, when present. */
  yearLabel: string | null;
  /** The `Teams:` line, verbatim entries, less any school not fielding a team. */
  officialTeamNames: string[];
  /** Those names resolved through the alias table; null = unknown to the registry. */
  officialTeamSlugs: Array<TeamSlug | null>;
  fixtures: OfficialFixture[];
  /** The Friday crossover / play-in column, when the grid has one. */
  crossoverDate: string | null;
  warnings: string[];
}

function toDateKey(monthWord: string, day: string, warnings: string[]): string | null {
  const month = MONTHS[monthWord.toUpperCase()];
  if (!month) {
    warnings.push(`unknown month "${monthWord}" in a day header`);
    return null;
  }
  return `${SCVAL_GRID_YEAR}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Assign a character offset to one of the (up to three) date columns. */
function columnFor(offset: number, headerOffsets: readonly number[]): number {
  for (let i = 1; i < headerOffsets.length; i += 1) {
    const boundary = (headerOffsets[i - 1] + headerOffsets[i]) / 2;
    if (offset < boundary) return i - 1;
  }
  return headerOffsets.length - 1;
}

export function parseSchedulePdfText(text: string, division: DivisionId): OfficialSchedule {
  const warnings: string[] = [];
  const leagueId = leagueOfDivision(division).id;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  if (!lines.some((l) => divisionHeaderRe(division).test(l))) {
    warnings.push(`the PDF text has no "${division}" division header — is this the right file?`);
  }

  const yearLine = lines.find((l) => /\d{4}\s*-\s*\d{4}\s*-\s*FIELD HOCKEY/i.test(l)) ?? null;
  const yearLabel = yearLine
    ? (/(\d{4}\s*-\s*\d{4})/.exec(yearLine)?.[1].replace(/\s+/g, ' ') ?? null)
    : null;

  const teamsLine = lines.find((l) => TEAMS_LINE_RE.test(l));
  const officialTeamNames = teamsLine
    ? (TEAMS_LINE_RE.exec(teamsLine)?.[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && !isWithdrawnSchool(s, leagueId))
    : [];
  if (officialTeamNames.length === 0) warnings.push('no "Teams:" roster line found');

  const fixtures: OfficialFixture[] = [];
  let headerDates: Array<{ dateKey: string | null; offset: number; weekday: string }> = [];
  let crossoverDate: string | null = null;

  for (const line of lines) {
    DAY_HEADER_RE.lastIndex = 0;
    const headers: Array<{ dateKey: string | null; offset: number; weekday: string }> = [];
    let hm: RegExpExecArray | null;
    while ((hm = DAY_HEADER_RE.exec(line)) !== null) {
      headers.push({ dateKey: toDateKey(hm[2], hm[3], warnings), offset: hm.index, weekday: hm[1] });
    }
    if (headers.length > 0) {
      headerDates = headers;
      for (const h of headers) {
        // The crossover / play-in block is the one Friday column (ADDENDUM, Article VII §2).
        if (h.weekday === 'FRIDAY' && h.dateKey) crossoverDate = h.dateKey;
      }
      continue;
    }

    MATCHUP_RE.lastIndex = 0;
    const offsets = headerDates.map((h) => h.offset);
    let mm: RegExpExecArray | null;
    while ((mm = MATCHUP_RE.exec(line)) !== null) {
      if (headerDates.length === 0) {
        warnings.push(`matchup "${mm[1].trim()} @ ${mm[2].trim()}" appeared before any day header`);
        continue;
      }
      const col = headerDates[columnFor(mm.index, offsets)];
      if (!col.dateKey) continue;
      const awayName = mm[1].trim();
      const homeName = mm[2].trim();
      // A school that is not fielding a team plays none of its grid fixtures.
      if (isWithdrawnSchool(awayName, leagueId) || isWithdrawnSchool(homeName, leagueId)) continue;
      const away = resolveOfficialName(leagueId, awayName);
      const home = resolveOfficialName(leagueId, homeName);
      if (!away) warnings.push(`official grid name "${awayName}" resolves to no registry team`);
      if (!home) warnings.push(`official grid name "${homeName}" resolves to no registry team`);
      const awaySlug = away?.slug ?? null;
      const homeSlug = home?.slug ?? null;
      fixtures.push({
        id: officialFixtureId(division, col.dateKey, { slug: awaySlug, name: awayName }, { slug: homeSlug, name: homeName }),
        league: leagueId,
        division,
        dateKey: col.dateKey,
        // The grid prints only a footer "Varsity 4:00", never a per-game time.
        time: null,
        awayName,
        homeName,
        awaySlug,
        homeSlug,
        source: 'scval-pdf',
      });
    }
  }

  fixtures.sort((a, b) =>
    a.dateKey === b.dateKey
      ? `${a.awayName}@${a.homeName}`.localeCompare(`${b.awayName}@${b.homeName}`)
      : a.dateKey.localeCompare(b.dateKey),
  );

  return {
    division,
    yearLabel,
    officialTeamNames,
    officialTeamSlugs: officialTeamNames.map((n) => resolveOfficialName(leagueId, n)?.slug ?? null),
    fixtures,
    crossoverDate,
    warnings,
  };
}

// ---------------------------------------------------------------- membership diff

export interface MembershipDiff {
  division: DivisionId;
  /** Official names the registry does not know. */
  unknownOfficialNames: string[];
  /** Registry slugs the official roster line omits. */
  missingFromOfficial: TeamSlug[];
  /** Official slugs the registry puts in the other division. */
  wrongDivision: Array<{ slug: TeamSlug; registryDivision: DivisionId }>;
  warnings: string[];
}

/** (a) of the brief: diff official membership against the registry and WARN — never rewrite it. */
export function diffMembership(schedule: OfficialSchedule): MembershipDiff {
  const warnings: string[] = [];
  const unknownOfficialNames: string[] = [];
  const wrongDivision: Array<{ slug: TeamSlug; registryDivision: DivisionId }> = [];
  const officialSlugs = new Set<TeamSlug>();

  for (const name of schedule.officialTeamNames) {
    const team = resolveTeam(name);
    if (!team) {
      unknownOfficialNames.push(name);
      warnings.push(`${schedule.division}: official roster names "${name}", unknown to the registry`);
      continue;
    }
    officialSlugs.add(team.slug);
    if (team.division !== schedule.division) {
      wrongDivision.push({ slug: team.slug, registryDivision: team.division });
      warnings.push(
        `${schedule.division}: official roster lists ${team.slug}, ` +
          `but the registry has it in ${team.division}`,
      );
    }
  }

  const missingFromOfficial = teamsInDivision(schedule.division)
    .map((t) => t.slug)
    .filter((slug) => !officialSlugs.has(slug));
  for (const slug of missingFromOfficial) {
    warnings.push(
      `${schedule.division}: registry has ${slug} but the official roster line does not`,
    );
  }

  return {
    division: schedule.division,
    unknownOfficialNames,
    missingFromOfficial,
    wrongDivision,
    warnings,
  };
}

// ---------------------------------------------------------------- fixture matching
//
// The matcher (formerly `applyOfficialFixtures`) lives in lib/official/match.ts as
// `matchOfficialFixtures(games, fixtures, { matcher: 'legacy', … })` (SPEC §7.8).

export interface CarryOfficialResult {
  /** The previous snapshot's unmatched fixtures for the divisions that were not read. */
  fixtures: OfficialFixture[];
  /** `games`, with `official` put back on the games those divisions own. */
  games: Game[];
  /** How many games got their marker back. */
  carried: number;
}

/**
 * SPEC §5.3, PER DIVISION: what to put back when one grid could not be read this run.
 *
 * The two grids are two requests and either can fail alone, so "did this run produce any official
 * fixtures at all" is the wrong question — El Camino matching all 56 of its fixtures legitimately
 * contributes an EMPTY unmatched array, which is indistinguishable from De Anza's request failing
 * if you only look at the section. Keyed on the division instead, nothing a successful grid said
 * this run is ever overwritten, and nothing a failed grid used to say is silently dropped.
 *
 * A game is attributed to a grid by `leagueDivision`, which is set only when both schools are
 * registry members of the same division — exactly what a division grid lists (verified: 56 rows
 * each, zero cross-division). Carry-forward only ever FILLS A HOLE: a marker this run produced
 * always wins.
 */
export function carryOfficialForward(
  missing: readonly DivisionId[],
  previous: { officialFixtures?: readonly OfficialFixture[]; games: readonly Game[] },
  games: readonly Game[],
): CarryOfficialResult {
  const wanted = new Set(missing);
  if (wanted.size === 0) return { fixtures: [], games: [...games], carried: 0 };

  const fixtures = (previous.officialFixtures ?? [])
    .filter((f) => wanted.has(f.division))
    .slice()
    .sort((a, b) =>
      a.dateKey === b.dateKey
        ? `${a.awayName}@${a.homeName}`.localeCompare(`${b.awayName}@${b.homeName}`)
        : a.dateKey.localeCompare(b.dateKey),
    );

  const prevById = new Map(previous.games.map((g) => [g.contestId, g]));
  let carried = 0;
  const out = games.map((game) => {
    if (game.official || game.leagueDivision === null || !wanted.has(game.leagueDivision)) {
      return game;
    }
    const official = prevById.get(game.contestId)?.official;
    if (!official) return game;
    carried += 1;
    return { ...game, official };
  });

  return { fixtures, games: out, carried };
}

// ---------------------------------------------------------------- prior-season PDFs

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

// ---------------------------------------------------------------- standings-index poll

export interface StandingsPdfLink {
  href: string;
  url: string;
}

/**
 * Poll https://www.scval.com/standings/ for a 2026-27 field hockey standings PDF. There is none as
 * of 2026-09-29 (zero hrefs match 26-27), so the URL is discovered, never hardcoded (SPEC §1.3).
 * Filenames carry literal spaces and apostrophes and must be percent-encoded per segment.
 */
export function findStandingsPdfLink(
  html: string,
  season: { start: string; alt: string } = { start: '2026-27', alt: '26-27' },
): StandingsPdfLink | null {
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (!/\.pdf$/i.test(href)) continue;
    if (!/field\s*hockey/i.test(href)) continue;
    if (!href.includes(season.start) && !href.includes(season.alt)) continue;
    if (!/standings/i.test(href)) continue;
    return { href, url: SCVAL_STANDINGS_INDEX + encodeURIComponent(href) };
  }
  return null;
}

/** Every field-hockey href on the standings index, for the log. */
export function listFieldHockeyLinks(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((h) => /field\s*hockey/i.test(h));
}

// ---------------------------------------------------------------- client

export class ScvalClient {
  private readonly http: HttpClient;

  constructor(opts: HttpClientOptions = {}) {
    this.http = new HttpClient(opts);
  }

  async getSchedule(division: DivisionId): Promise<{
    schedule: OfficialSchedule;
    url: string;
    httpStatus: number;
    bytes: number;
  }> {
    const url = scvalScheduleUrl(division);
    const res = await this.http.bytes(url);
    const text = pdfToText(res.body);
    return {
      schedule: parseSchedulePdfText(text, division),
      url,
      httpStatus: res.httpStatus,
      bytes: res.body.byteLength,
    };
  }

  /** The prior-season PDFs. Used by scripts/build-history.ts, never by the daily cron. */
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

  async getStandingsIndex(): Promise<{
    link: StandingsPdfLink | null;
    links: string[];
    url: string;
    httpStatus: number;
  }> {
    const res = await this.http.text(SCVAL_STANDINGS_INDEX);
    return {
      link: findStandingsPdfLink(res.body),
      links: listFieldHockeyLinks(res.body),
      url: SCVAL_STANDINGS_INDEX,
      httpStatus: res.httpStatus,
    };
  }
}
