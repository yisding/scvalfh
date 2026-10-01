/**
 * OFFICIAL source: the two scval.com schedule-grid PDFs (SPEC §1.3).
 *
 * These are the authority for DIVISION ALIGNMENT and for the official league fixture list — the
 * only place Wilcox's 14 De Anza games exist at all. They carry no scores and no times beyond the
 * footer's "Varsity 4:00".
 *
 * Extraction facts, all verified against the live files:
 *   - `http://` 302s to `https://`; redirects must be followed.
 *   - `pdftotext -layout` (poppler-utils). No binary ⇒ the step reports `skipped`, never fails.
 *   - the grid is COLUMN-MAJOR with three date columns per band, so naive line reading interleaves
 *     three different dates. Each matchup is assigned to a column by its character offset.
 *   - the naive "split on 2+ spaces, re-pair on @" approach is broken: `ST. FRANCIS        @   FREMONT`
 *     shatters into `"@"` and `"FREMONT"`. The verified matchup regex below scores 56/56 on both
 *     PDFs with zero bad rows.
 *   - group 1 is AWAY, group 2 is HOME (`WILCOX @ VALLEY CHRISTIAN` = Wilcox away at Valley
 *     Christian).
 *   - the Friday Oct 30 column is the crossover block (`DE ANZA #4 VS EL CAMINO #4`, `#1 v. #1`)
 *     and carries no `@`, so it falls out of the matchup regex on its own.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DIVISION_LABELS } from '../season';
import { resolveTeam, teamsInDivision } from '../teams';
import type { Division, Game, OfficialFixture, TeamSlug } from '../types';
import { HttpClient, type HttpClientOptions } from './http';

export const SCVAL_SCHEDULE_PDFS: Record<Division, string> = {
  'de-anza': 'https://scval.com/fallSports/26-27%20SCVAL%20FH%20DA%20Final.pdf',
  'el-camino': 'https://scval.com/fallSports/26-27%20SCVAL%20FH%20EC%20Final.pdf',
};

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

const DIVISION_HEADERS: Record<Division, RegExp> = {
  'de-anza': /DE\s+ANZA\s+DIVISION/i,
  'el-camino': /EL\s+CAMINO\s+DIVISION/i,
};

export interface OfficialSchedule {
  division: Division;
  /** "2026 - 2027" from the page header, when present. */
  yearLabel: string | null;
  /** The `Teams:` line, verbatim entries. */
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

export function parseSchedulePdfText(text: string, division: Division): OfficialSchedule {
  const warnings: string[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  if (!lines.some((l) => DIVISION_HEADERS[division].test(l))) {
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
        .filter(Boolean)
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
      const away = resolveTeam(awayName);
      const home = resolveTeam(homeName);
      if (!away) warnings.push(`official grid name "${awayName}" resolves to no registry team`);
      if (!home) warnings.push(`official grid name "${homeName}" resolves to no registry team`);
      fixtures.push({
        division,
        dateKey: col.dateKey,
        awayName,
        homeName,
        awaySlug: away?.slug ?? null,
        homeSlug: home?.slug ?? null,
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
    officialTeamSlugs: officialTeamNames.map((n) => resolveTeam(n)?.slug ?? null),
    fixtures,
    crossoverDate,
    warnings,
  };
}

// ---------------------------------------------------------------- membership diff

export interface MembershipDiff {
  division: Division;
  /** Official names the registry does not know. */
  unknownOfficialNames: string[];
  /** Registry slugs the official roster line omits. */
  missingFromOfficial: TeamSlug[];
  /** Official slugs the registry puts in the other division. */
  wrongDivision: Array<{ slug: TeamSlug; registryDivision: Division }>;
  warnings: string[];
}

/** (a) of the brief: diff official membership against the registry and WARN — never rewrite it. */
export function diffMembership(schedule: OfficialSchedule): MembershipDiff {
  const warnings: string[] = [];
  const unknownOfficialNames: string[] = [];
  const wrongDivision: Array<{ slug: TeamSlug; registryDivision: Division }> = [];
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

export interface ApplyFixturesResult {
  games: Game[];
  /** Fixtures matched to a MaxPreps contest. */
  matched: number;
  /** Fixtures with no MaxPreps contest — Wilcox's whole slate lives here. */
  unmatched: OfficialFixture[];
  /** Matched contests MaxPreps does NOT flag as league games. */
  leagueDisagreements: string[];
  warnings: string[];
}

function orderedKey(away: string, home: string): string {
  return `${away}@${home}`;
}

function unorderedKey(a: string, b: string): string {
  return [a, b].sort().join('~');
}

function sideKeyOf(side: { slug: TeamSlug | null; name: string }): string {
  return side.slug ?? `name:${side.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

/**
 * How far a NON-LEAGUE contest may be from the grid's date and still be read as the same,
 * rescheduled, game.
 *
 * The cap exists for exactly one shape: a pair of schools that also meet in an August friendly.
 * An unbounded search could stamp an official league fixture onto that preseason game and then
 * report the real league leg as "scheduled per SCVAL, no result reported". A contest MaxPreps
 * itself flags `isLeague` cannot be that friendly, so it is not distance-capped at all — the
 * published De Anza grid moved ST. IGNATIUS @ LOS ALTOS from Sep 9 to Oct 8, twenty-nine days,
 * and a two-week cap dropped the "Moved" note off a game the site already lists while publishing
 * the empty Sep 9 slot as an unplayed fixture. The ordered AWAY@HOME key plus one-game-per-fixture
 * consumption are what keep the two legs of the round robin apart; the cap never was.
 */
const RESCHEDULE_WINDOW_DAYS = 14;

/**
 * (b) of the brief: corroborate `isLeague` against the official grid and attach
 * `game.official = {scheduledDate, source:'scval-pdf'}` to every matched contest.
 *
 * Three passes, each consuming at most one game per fixture:
 *   1. same date, same AWAY@HOME ordering  — the normal case
 *   2. same date, home/away swapped        — matched, and WARNED. The grid is NOT the authority on
 *      the host: SPEC §5.5.4 derives home/away only from schedule-calculated's
 *      `teams[].homeAwayType`, so a swap is never applied to the contest. It is carried onto the
 *      game as `provenance.hostConflict`, exactly as a league-flag disagreement is carried as
 *      `provenance.leagueFlagConflict`, so the disagreement is published data rather than a log
 *      line that dies with the run.
 *   3. same AWAY@HOME, league games first then nearest date — a rescheduled game; `scheduledDate`
 *      then differs from `dateKey`, which is how the UI can say "moved from …". A NON-LEAGUE
 *      candidate is capped at ±RESCHEDULE_WINDOW_DAYS; a league one is not.
 */
export function applyOfficialFixtures(
  games: readonly Game[],
  fixtures: readonly OfficialFixture[],
): ApplyFixturesResult {
  const warnings: string[] = [];
  const leagueDisagreements: string[] = [];
  /** contestId → the sentence the game itself will carry. */
  const disagreed = new Map<string, string>();
  /** contestId → "the grid has X hosting, MaxPreps has Y". Published, not just logged. */
  const hostDisagreed = new Map<string, string>();
  const official = new Map<string, OfficialFixture>();
  const consumed = new Set<string>();

  const byDateOrdered = new Map<string, Game[]>();
  const byDateUnordered = new Map<string, Game[]>();
  const byOrdered = new Map<string, Game[]>();
  const push = (map: Map<string, Game[]>, key: string, game: Game) => {
    const list = map.get(key);
    if (list) list.push(game);
    else map.set(key, [game]);
  };
  for (const g of games) {
    const away = sideKeyOf(g.away);
    const home = sideKeyOf(g.home);
    push(byDateOrdered, `${g.dateKey}|${orderedKey(away, home)}`, g);
    push(byDateUnordered, `${g.dateKey}|${unorderedKey(away, home)}`, g);
    push(byOrdered, orderedKey(away, home), g);
  }

  const take = (list: Game[] | undefined): Game | null => {
    if (!list) return null;
    for (const g of list) if (!consumed.has(g.contestId)) return g;
    return null;
  };

  const unmatched: OfficialFixture[] = [];
  let matched = 0;

  for (const fixture of fixtures) {
    if (!fixture.awaySlug || !fixture.homeSlug) {
      unmatched.push(fixture);
      continue;
    }
    const ordered = orderedKey(fixture.awaySlug, fixture.homeSlug);
    let game = take(byDateOrdered.get(`${fixture.dateKey}|${ordered}`));
    if (!game) {
      const swapped = take(byDateUnordered.get(`${fixture.dateKey}|${unorderedKey(fixture.awaySlug, fixture.homeSlug)}`));
      if (swapped) {
        warnings.push(
          `${fixture.dateKey} ${fixture.awayName} @ ${fixture.homeName}: ` +
            'MaxPreps has the host the other way round',
        );
        // Home/away stays MaxPreps' (SPEC §5.5.4) — but the disagreement is PUBLISHED on the
        // game, not only warned about, so the venue claim is not the only surviving record of it.
        // The sentence is read by a human on the game page (GameDetails' WHERE block), so it uses
        // the display name rather than the grid's UPPERCASE spelling, and carries no date: this is
        // the same-date pass, so the date is the one the page already states two lines above.
        const gridHost = resolveTeam(fixture.homeSlug)?.name ?? fixture.homeName;
        hostDisagreed.set(
          swapped.contestId,
          `the official ${DIVISION_LABELS[fixture.division]} grid has ${gridHost} hosting; ` +
            `MaxPreps has ${swapped.home.name}, and MaxPreps is the only source of the two that ` +
            'states home and away.',
        );
        game = swapped;
      }
    }
    if (!game) {
      // A rescheduled leg. League games first, then nearest date, so the two legs of the round
      // robin cannot cross over. The distance cap applies ONLY to a candidate MaxPreps does not
      // flag as a league game: these schools meet three times in a season (both league legs plus
      // a non-league preseason friendly), and an unbounded search could stamp the official league
      // fixture onto that August friendly and then report the real league game as "scheduled per
      // SCVAL, no result reported". A real league leg can move much further than two weeks —
      // see RESCHEDULE_WINDOW_DAYS.
      const days = (a: string, b: string) =>
        Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
      const candidates = (byOrdered.get(ordered) ?? []).filter(
        (g) =>
          !consumed.has(g.contestId) &&
          (g.isLeague || days(g.dateKey, fixture.dateKey) <= RESCHEDULE_WINDOW_DAYS),
      );
      candidates.sort(
        (a, b) =>
          Number(b.isLeague) - Number(a.isLeague) ||
          days(a.dateKey, fixture.dateKey) - days(b.dateKey, fixture.dateKey),
      );
      game = candidates[0] ?? null;
      if (game) {
        warnings.push(
          `${fixture.awayName} @ ${fixture.homeName}: official ${fixture.dateKey}, ` +
            `MaxPreps ${game.dateKey}`,
        );
      }
    }
    if (!game) {
      unmatched.push(fixture);
      continue;
    }
    consumed.add(game.contestId);
    official.set(game.contestId, fixture);
    matched += 1;
    if (!game.isLeague) {
      const note =
        `the official ${DIVISION_LABELS[fixture.division]} grid has this as a league fixture ` +
        `on ${fixture.dateKey}; MaxPreps flags it non-league`;
      leagueDisagreements.push(`${game.contestId} (${fixture.awayName} @ ${fixture.homeName}) — ${note}`);
      // Carried on the GAME, not just into a log line: the standings tally on `isLeague`, so a
      // MaxPreps contestType mis-flag drops a real league result from the table, and MaxPreps'
      // own reported table cannot catch it — it uses the same flag. This is the only published
      // signal that the two sources disagree about what counts.
      disagreed.set(game.contestId, note);
    }
  }

  const out = games.map((g) => {
    const fixture = official.get(g.contestId);
    if (!fixture) return g;
    const note = disagreed.get(g.contestId);
    const hostNote = hostDisagreed.get(g.contestId);
    const provenance = {
      ...g.provenance,
      ...(note && !g.provenance.leagueFlagConflict ? { leagueFlagConflict: note } : {}),
      ...(hostNote ? { hostConflict: hostNote } : {}),
    };
    return {
      ...g,
      official: { scheduledDate: fixture.dateKey, source: 'scval-pdf' as const },
      provenance,
    };
  });

  unmatched.sort((a, b) =>
    a.dateKey === b.dateKey
      ? `${a.awayName}@${a.homeName}`.localeCompare(`${b.awayName}@${b.homeName}`)
      : a.dateKey.localeCompare(b.dateKey),
  );

  return { games: out, matched, unmatched, leagueDisagreements, warnings };
}

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
  missing: readonly Division[],
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
  division: Division;
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
  division: Division;
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

  async getSchedule(division: Division): Promise<{
    schedule: OfficialSchedule;
    url: string;
    httpStatus: number;
    bytes: number;
  }> {
    const url = SCVAL_SCHEDULE_PDFS[division];
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
