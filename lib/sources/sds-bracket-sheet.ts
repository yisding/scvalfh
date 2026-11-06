/**
 * PLAYOFF source: the CIF San Diego Section's own bracket sheet, "2026 CIFSDS Field Hockey Championship
 * Bracket" (a Google Sheet, SDS_BRACKET_SHEET_URL), read for the results of the Section's playoff games.
 *
 * Why: MaxPreps does not get every San Diego playoff game. On 2026-11-06 it had no contest at all for three
 * games the Section had already posted (Mission Bay 3-2 OT La Jolla Country Day, Nov 3; San Pasqual 5-0 Mira
 * Mesa, Nov 4; Torrey Pines 4-0 Del Norte, Nov 5). si.com listed those three pairs with no score, and
 * cifsshome.org's San Diego listing did not have them. The Section asks every school to report its score
 * ("Please report scores promptly to SCORES@CIFSDS.ORG") and writes it into this sheet, so the sheet is the
 * one place every result reaches.
 *
 * What is read: each bracket tab as CSV (`export?format=csv&gid=<tab>`, public, no key), which keeps the
 * sheet's grid. The 2025 and 2026 sheets share one layout (verified against both on 2026-11-06):
 *   - row 1 is the tab's title ("Open Division", "Division I", "Division II");
 *   - row 2 dates each round's column ("Tuesday, November 03, 2026"); a column with no date is a label column
 *     ("#1", "#12") unless it comes after the last dated one, where the Section writes the champion;
 *   - row 3 says where the round is played ("@ Higher Seed", "3:30PM @ La Jolla High School");
 *   - below that, a round's column lists its teams top to bottom, two to a game ("BYE" fills a place), with the
 *     game's notes on the rows between its two teams: "Game Time: 6:00 PM" (or a bare "3:15PM"), "Game Moved
 *     to Wednesday, November 4th", "@ Vista High School";
 *   - the winner is written into the next column, on a row between the two, and the score on the row under
 *     the winner's name, winner's goals first: "3-1", "3-2(OT)", "1-0 (2OT)", "1-1 (2-1 SO)".
 * A winner with no score under it (the Section wrote who went through but not the score) is no result here.
 *
 * Every cell of a round's column must be one of those things. A cell this parser cannot place (a school name it
 * cannot resolve, a note in a new wording) makes that column unreadable: no game in it, and none fed from it, is
 * read, and the reason is returned as a warning, so a misread can never pair the wrong two teams. Team names
 * resolve only to the teams of that division in data/sds-brackets-2026.json, after the sheet's " HS" and
 * "Charter" are dropped ("Helix Charter HS" is Helix).
 *
 * Pure: no I/O. lib/pipeline/steps/secondary.ts fetches the tabs and lib/postseason/sds-sheet-results.ts turns
 * the results into games.
 */

import { normalizeTeamKey, getTeamBySlug } from '../teams';
import type { TeamSlug } from '../types';
import { parseCsv } from './bval-sheet';

/** One game the sheet has a result for. */
export interface SdsSheetResult {
  /** The division id from data/sds-brackets-2026.json ('open', 'division-1', 'division-2'). */
  division: string;
  /** The round's column date, or the date of a "Game Moved to …" note in the game's cells. */
  dateKey: string;
  /** 'HH:MM' (24-hour, Pacific) from the game's "Game Time" note, else the round's header; null when neither has one. */
  time: string | null;
  /** The game's "@ <place>" note, else the round's header's ("La Jolla High School" for the finals); null when neither. */
  venue: string | null;
  winner: TeamSlug;
  loser: TeamSlug;
  winnerGoals: number;
  loserGoals: number;
  /** Overtime periods the score names: "(OT)" 1, "(2OT)" 2; 0 otherwise (and for a shootout). */
  otPeriods: number;
  /** A level score decided by a shootout ("1-1 (2-1 SO)"). */
  shootout: boolean;
  /** The score cell as the sheet prints it, trimmed. */
  scoreText: string;
}

export type SdsSheetRead =
  | { recognised: true; results: SdsSheetResult[]; warnings: string[] }
  | { recognised: false; reason: string };

/** What the parser needs of one division: its id, the tab's title, and the division's teams. */
export interface SdsSheetDivision {
  id: string;
  label: string;
  teams: readonly TeamSlug[];
}

// ---------------------------------------------------------------- cells

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function monthIndex(name: string): number {
  const n = name.toLowerCase();
  return MONTHS.findIndex((m) => m === n || (n.length >= 3 && m.startsWith(n)));
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "Tuesday, November 03, 2026" → '2026-11-03'; null for anything else. */
export function headerDate(text: string): string | null {
  const m = /^\s*(?:[a-z]+,\s*)?([a-z]+)\.?\s+(\d{1,2}),\s*(\d{4})\s*$/i.exec(text);
  if (!m) return null;
  const month = monthIndex(m[1]);
  const day = Number(m[2]);
  if (month < 0 || day < 1 || day > 31) return null;
  return `${m[3]}-${pad(month + 1)}-${pad(day)}`;
}

/** "6:00 PM" / "3:15PM" / "10:00 AM" → 'HH:MM' on a 24-hour clock; null when the text is no clock time. */
function clock(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?$/i.exec(text.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (m[3].toLowerCase() === 'p' && hour !== 12) hour += 12;
  if (m[3].toLowerCase() === 'a' && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(minute)}`;
}

/** A score cell, winner's goals first: "3-1", "3-2(OT)", "1-0 (2OT)", "1-1 (2-1 SO)", "2-2 (SO)". */
const SCORE_RE = /^(\d{1,2})\s*-\s*(\d{1,2})\s*(?:\(\s*(?:(\d)?\s*OT|(?:(\d{1,2})\s*-\s*(\d{1,2})\s*)?(?:SO|PK|shootout))\s*\))?$/i;

interface Score {
  winnerGoals: number;
  loserGoals: number;
  otPeriods: number;
  shootout: boolean;
  text: string;
}

export function parseScore(text: string): Score | null {
  const t = text.trim();
  const m = SCORE_RE.exec(t);
  if (!m) return null;
  const shootout = /\b(?:SO|PK|shootout)\b/i.test(t);
  const otPeriods = shootout || !/OT\b/i.test(t) ? 0 : m[3] ? Number(m[3]) : 1;
  return { winnerGoals: Number(m[1]), loserGoals: Number(m[2]), otPeriods, shootout, text: t };
}

type Cell =
  | { kind: 'team'; slug: TeamSlug }
  | { kind: 'bye' }
  | { kind: 'score'; score: Score }
  | { kind: 'time'; time: string | null }
  | { kind: 'moved'; month: number; day: number }
  | { kind: 'venue'; text: string }
  | { kind: 'ignored' }
  | { kind: 'unknown'; text: string };

/** Words the Section prints beside the bracket that say nothing about a game. */
const BOILERPLATE = [
  /^purchase tickets$/i,
  /^nfhs network live stream$/i,
  /^please report scores/i,
  /^champions?$/i,
  /^#\d{1,2}$/,
];

function teamKeys(slug: TeamSlug): string[] {
  const t = getTeamBySlug(slug);
  if (!t) return [normalizeTeamKey(slug)];
  return [t.name, t.shortName, ...t.aliases].map(normalizeTeamKey);
}

/** The sheet's spellings without the decoration it adds ("Helix Charter HS" → "Helix"). */
function nameVariants(text: string): string[] {
  const t = text.trim();
  const noHs = t.replace(/\s+(?:HS|H\.S\.|High School|High)$/i, '');
  const noCharter = noHs.replace(/\s+Charter$/i, '');
  const noThe = noCharter.replace(/^The\s+/i, '');
  return [...new Set([t, noHs, noCharter, noThe])];
}

function classify(text: string, resolve: (name: string) => TeamSlug | null): Cell {
  const t = text.trim();
  if (/^bye$/i.test(t)) return { kind: 'bye' };
  const score = parseScore(t);
  if (score) return { kind: 'score', score };
  const timed = /^(?:game\s+)?time:?\s*(.*)$/i.exec(t);
  if (timed) {
    if (timed[1].trim() === '') return { kind: 'time', time: null };
    const c = clock(timed[1]);
    if (c) return { kind: 'time', time: c };
  }
  const bare = clock(t);
  if (bare) return { kind: 'time', time: bare };
  const moved = /^game\s+moved\s+to\s+(?:[a-z]+,?\s+)?([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\.?$/i.exec(t);
  if (moved && monthIndex(moved[1]) >= 0) return { kind: 'moved', month: monthIndex(moved[1]) + 1, day: Number(moved[2]) };
  const venue = /^@\s*(.+)$/.exec(t);
  if (venue) return { kind: 'venue', text: venue[1].trim() };
  if (BOILERPLATE.some((re) => re.test(t))) return { kind: 'ignored' };
  const slug = resolve(t);
  if (slug) return { kind: 'team', slug };
  return { kind: 'unknown', text: t };
}

/** A round's header under its date: "3:30PM @ La Jolla High School" → its clock and its place (not "Higher Seed"). */
function roundHeader(text: string): { time: string | null; venue: string | null } {
  const m = /^\s*(?:([0-9:]+\s*[ap]\.?\s*m\.?)\s*)?@\s*(.+?)\s*$/i.exec(text);
  if (!m) return { time: null, venue: null };
  const venue = /higher seed|highlighted site|top seed|home team/i.test(m[2]) ? null : m[2];
  return { time: m[1] ? clock(m[1]) : null, venue };
}

// ---------------------------------------------------------------- the tab

interface Column {
  index: number;
  /** null: the champion's column after the last round. */
  date: string | null;
  header: { time: string | null; venue: string | null };
  /** Non-empty cells below the header rows, by row. */
  cells: Map<number, Cell>;
  /** Why the column cannot be read, or null. */
  unreadable: string | null;
}

/** The first row a round's cells can be on (rows 1-3 are the title, the dates and the sites). */
const FIRST_BODY_ROW = 3;

/**
 * One bracket tab's results. `recognised: false` when the CSV is not this division's bracket tab (its title is
 * not the division's label, or no round is dated): the caller keeps what it had.
 */
export function parseSdsBracketTab(csv: string, division: SdsSheetDivision): SdsSheetRead {
  let grid: string[][];
  try {
    grid = parseCsv(csv);
  } catch (err) {
    return { recognised: false, reason: `not CSV (${(err as Error).message})` };
  }
  const title = (grid[0] ?? []).map((c) => c.trim()).find((c) => c !== '') ?? '';
  if (title.toLowerCase() !== division.label.toLowerCase()) {
    return { recognised: false, reason: `the tab's title is ${JSON.stringify(title)}, not ${JSON.stringify(division.label)}` };
  }

  const keys = new Map<string, TeamSlug>();
  for (const slug of division.teams) for (const k of teamKeys(slug)) keys.set(k, slug);
  const resolve = (name: string): TeamSlug | null => {
    for (const v of nameVariants(name)) {
      const hit = keys.get(normalizeTeamKey(v));
      if (hit) return hit;
    }
    return null;
  };

  const width = Math.max(0, ...grid.map((r) => r.length));
  const dates = grid[1] ?? [];
  const sites = grid[2] ?? [];
  const dated: number[] = [];
  for (let c = 0; c < width; c += 1) if (headerDate(dates[c] ?? '')) dated.push(c);
  if (dated.length < 2) return { recognised: false, reason: `${dated.length} dated round ${dated.length === 1 ? 'column' : 'columns'}` };

  const readColumn = (index: number, date: string | null): Column => {
    const cells = new Map<number, Cell>();
    let unreadable: string | null = null;
    for (let r = FIRST_BODY_ROW; r < grid.length; r += 1) {
      const text = (grid[r]?.[index] ?? '').trim();
      if (text === '') continue;
      const cell = classify(text, resolve);
      if (cell.kind === 'ignored') continue;
      if (cell.kind === 'unknown' && unreadable === null) unreadable = `row ${r + 1} reads ${JSON.stringify(cell.text)}`;
      cells.set(r, cell);
    }
    return { index, date, header: roundHeader(sites[index] ?? ''), cells, unreadable };
  };

  const columns: Column[] = dated.map((c) => readColumn(c, headerDate(dates[c] ?? '')));
  // The champion's column: the first column after the last round with a team in it.
  for (let c = dated[dated.length - 1] + 1; c < width; c += 1) {
    const col = readColumn(c, null);
    if ([...col.cells.values()].some((x) => x.kind === 'team')) {
      columns.push(col);
      break;
    }
  }

  const warnings: string[] = [];
  const results: SdsSheetResult[] = [];
  const letter = (c: number) => String.fromCharCode(65 + c);
  for (const col of columns) {
    if (col.unreadable) warnings.push(`${division.label}: column ${letter(col.index)} not read (${col.unreadable})`);
  }

  for (let i = 0; i + 1 < columns.length; i += 1) {
    const col = columns[i];
    const next = columns[i + 1];
    if (col.date === null || col.unreadable || next.unreadable) continue;
    const entrants = [...col.cells.entries()].filter(([, c]) => c.kind === 'team' || c.kind === 'bye').sort((a, b) => a[0] - b[0]);
    if (entrants.length % 2 !== 0) {
      warnings.push(`${division.label}: column ${letter(col.index)} lists ${entrants.length} places, an odd number; not read`);
      continue;
    }
    for (let p = 0; p < entrants.length; p += 2) {
      const [rowA, a] = entrants[p];
      const [rowB, b] = entrants[p + 1];
      if (a.kind !== 'team' || b.kind !== 'team') continue;
      if (a.slug === b.slug) {
        warnings.push(`${division.label}: ${a.slug} on both sides of one game in column ${letter(col.index)}; not read`);
        continue;
      }
      // The winner: the team written into the next column between the two.
      const advanced = [...next.cells.entries()].filter(([r, c]) => r > rowA && r < rowB && c.kind === 'team');
      if (advanced.length === 0) continue;
      const [winRow, winCell] = advanced[0];
      const winner = winCell.kind === 'team' ? winCell.slug : null;
      if (advanced.length > 1 || (winner !== a.slug && winner !== b.slug)) {
        warnings.push(`${division.label}: the winner of ${a.slug} v ${b.slug} (column ${letter(next.index)}) is not one of the two; not read`);
        continue;
      }
      const scoreCell = next.cells.get(winRow + 1);
      if (!scoreCell || scoreCell.kind !== 'score') continue;
      const score = scoreCell.score;
      if (score.winnerGoals < score.loserGoals || (score.winnerGoals === score.loserGoals) !== score.shootout) {
        warnings.push(`${division.label}: ${winner} won ${a.slug} v ${b.slug} but the score reads ${JSON.stringify(score.text)}; not read`);
        continue;
      }

      // The game's own notes, on the rows between its two teams.
      let dateKey = col.date;
      let time: string | null = null;
      let venue: string | null = null;
      for (const [r, c] of col.cells) {
        if (r <= rowA || r >= rowB) continue;
        if (c.kind === 'moved') dateKey = `${col.date.slice(0, 4)}-${pad(c.month)}-${pad(c.day)}`;
        else if (c.kind === 'time' && c.time !== null) time = c.time;
        else if (c.kind === 'venue') venue = c.text;
      }
      results.push({
        division: division.id,
        dateKey,
        time: time ?? col.header.time,
        venue: venue ?? col.header.venue,
        winner: winner as TeamSlug,
        loser: winner === a.slug ? b.slug : a.slug,
        winnerGoals: score.winnerGoals,
        loserGoals: score.loserGoals,
        otPeriods: score.otPeriods,
        shootout: score.shootout,
        scoreText: score.text,
      });
    }
  }
  return { recognised: true, results, warnings };
}
