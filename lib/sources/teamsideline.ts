/**
 * A TeamSideline schedule page, read whole: the league's own standings, every regular-season game with its score
 * once played, and the playoff schedule. TeamSideline is the host the Valley Athletic League's site (valleyal.org)
 * runs on; one page per program and level (`/schedule/<id>/0/1/<slug>`, e.g. girls soccer 7th/8th grade), served as
 * ASP.NET HTML with everything in it, so nothing here runs a script (captured: tests/fixtures/teamsideline/).
 *
 * What the parser keys on, all of it the grids' own control ids (the page draws each grid twice, once for wide
 * screens and once, `Mobile…`, for phones; only the wide copy is read):
 *
 *   <h1>Girls' Soccer 26-27</h1> <div id="PageSubTitleSpan">7th/8th Grade</div>
 *   …_StandingsResultsControl_standingsGrid_ctl00      <th>Place</th><th>Team</th><th>W</th>… one <tr> a team
 *   …_StandingsResultsControl_ScheduleGrid_ctl00_ctlNN_DateLabel | TimeLabel | HomeLabel | HomeScoreLabel |
 *                                                      AwayLabel | AwayScoreLabel | ScheduleLabel (the field)
 *   …_StandingsResultsControl_ScheduleGrid_ctl00_ctlNN_CommentsLabel   a note on the game row before it
 *   <tr class="rgGroupHeader"><td><p>Week 1</p></td></tr>               the week the rows after it are in
 *   …_StandingsResultsControl_PlayoffGrid_ctl00_ctlNN_GameLabel (G1…) and the same labels, under
 *   <tr class="rgGroupHeader"><td><p>Playoff Round  1</p></td></tr>; a side not yet known is a seed ("4th") or a
 *   game's winner ("G1 Winner").
 *   …_TieBreakerTooltip1 … "1> Head-To-Head<br />2> Coin Toss"           the page's own tiebreak list
 *
 * A winner's name and score are bold (`<b>`); a level score bolds neither. The page gives a day and month only
 * ("Tue 12/15"); the year is the season's (seasonDate). Nothing is inferred: a row the parser cannot read fails the
 * page (TeamsidelineParseError), never a half-read schedule.
 *
 * Pure, with no imports but the entity decoder.
 */

import { BASIC_NAMED, decodeEntities } from './html-entities';

export class TeamsidelineParseError extends Error {}

/** One row of the page's standings grid, as the page prints it. */
export interface TeamsidelineStandingRow {
  /** The place column; null before any game is played (the page leaves it blank). */
  place: number | null;
  team: string;
  w: number;
  l: number;
  t: number;
  /** Games played. */
  gp: number;
  /** The page's points column, where the program has one (soccer: 3 a win, 1 a tie). */
  pts: number | null;
}

/** One side of a game as the page prints it: the team's name, its score (null before the game is played), bold or not. */
export interface TeamsidelineSide {
  name: string;
  score: number | null;
  /** The page bolds a winner's name and score. */
  bold: boolean;
}

export interface TeamsidelineGame {
  /** The band the row is under: 'Week 1', 'Playoff Round  1', 'Playoff Round  3 - Championship Round'; null: none. */
  band: string | null;
  /** 'M/D' as printed ('12/15'). */
  monthDay: string;
  /** 24-hour 'HH:MM', or null when the page prints no time. */
  time: string | null;
  home: TeamsidelineSide;
  away: TeamsidelineSide;
  /** The field the page names ('Lawson Field', 'TBD Field 1'), or null. */
  location: string | null;
  /** The map link the page gives the field, or null. */
  locationUrl: string | null;
  /** The comments the page prints under the row ('Moved to 1/13.'), trimmed, in order. */
  comments: string[];
  /** A playoff game's label ('G1'); null for a regular-season game. */
  gameLabel: string | null;
}

export interface TeamsidelinePage {
  /** The page's heading: "Girls' Soccer 26-27". */
  title: string;
  /** The level under it: '7th/8th Grade'. */
  subtitle: string;
  /** The page's tiebreak list, in order ('Head-To-Head', 'Coin Toss'); empty when it prints none. */
  tieBreakers: string[];
  standings: TeamsidelineStandingRow[];
  /** Every regular-season row, in page order. */
  games: TeamsidelineGame[];
  /** Every playoff row, in page order. */
  playoffs: TeamsidelineGame[];
}

const GRID = 'ctl00_ContentPlaceHolder1_StandingsResultsControl_';

/** The text of a fragment: tags dropped, entities decoded, whitespace collapsed. */
export function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, ' '), BASIC_NAMED).replace(/[\s ]+/g, ' ').trim();
}

/** The inner HTML of the first element whose id is `id` (a <span> or a <div>), or null. */
function innerOf(html: string, tag: 'span' | 'div', id: string): string | null {
  const open = new RegExp(`<${tag}\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  // Labels nest a <b> at most; a span's text ends at its first closing tag of the same name.
  const end = html.indexOf(`</${tag}>`, start);
  return end < 0 ? null : html.slice(start, end);
}

/** '4:00 PM' → '16:00'; '' or anything else → null. */
export function clock24(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]) % 12 + (m[3].toUpperCase() === 'P' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** '12/15' in a season that starts in `fallYear` → '2026-12-15'; months before August are the next calendar year. */
export function seasonDate(monthDay: string, fallYear: number): string {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(monthDay);
  if (!m) throw new TeamsidelineParseError(`not a M/D date: ${JSON.stringify(monthDay)}`);
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new TeamsidelineParseError(`not a date: ${monthDay}`);
  const year = month >= 8 ? fallYear : fallYear + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function score(text: string | null): number | null {
  const t = textOf(text ?? '');
  if (t === '') return null;
  if (!/^\d+$/.test(t)) throw new TeamsidelineParseError(`not a score: ${JSON.stringify(t)}`);
  return Number(t);
}

function sideOf(row: string, prefix: string, which: 'Home' | 'Away'): TeamsidelineSide {
  const nameHtml = innerOf(row, 'span', `${prefix}${which}Label`);
  if (nameHtml === null) throw new TeamsidelineParseError(`a row with no ${which.toLowerCase()} side (${prefix})`);
  const scoreHtml = innerOf(row, 'span', `${prefix}${which}ScoreLabel`);
  const name = textOf(nameHtml);
  if (name === '') throw new TeamsidelineParseError(`a row with a blank ${which.toLowerCase()} side (${prefix})`);
  return { name, score: score(scoreHtml), bold: /<b>/i.test(nameHtml) };
}

/**
 * The rows of one grid (`ScheduleGrid` or `PlayoffGrid`), in page order: each game row's labels, the band it is
 * under, and the comment rows that follow it.
 */
function gridRows(html: string, grid: 'ScheduleGrid' | 'PlayoffGrid'): TeamsidelineGame[] {
  const tableId = `${GRID}${grid}_ctl00`;
  const start = html.indexOf(`id="${tableId}"`);
  if (start < 0) return [];
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end < 0 ? html.length : end);
  const games: TeamsidelineGame[] = [];
  let band: string | null = null;
  for (const tr of table.split(/<tr\b/).slice(1)) {
    if (/^[^>]*class="rgGroupHeader"/.test(tr)) {
      // textOf collapses the page's own spacing: 'Playoff Round  1' → 'Playoff Round 1'.
      band = textOf(/<p>([\s\S]*?)<\/p>/.exec(tr)?.[1] ?? '') || null;
      continue;
    }
    const comment = new RegExp(`id="${tableId}_ctl\\d+_CommentsLabel"[^>]*>([\\s\\S]*?)</span>`).exec(tr);
    if (comment) {
      const last = games[games.length - 1];
      if (!last) throw new TeamsidelineParseError(`${grid}: a comment row before any game`);
      const text = textOf(comment[1]);
      if (text !== '') last.comments.push(text);
      continue;
    }
    const date = new RegExp(`id="(${tableId}_ctl\\d+_)DateLabel"[^>]*>([\\s\\S]*?)</span>`).exec(tr);
    if (!date) continue; // an empty spacer row
    const prefix = date[1];
    const dateText = textOf(date[2]);
    const md = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}\/\d{1,2})$/.exec(dateText);
    if (!md) throw new TeamsidelineParseError(`${grid}: not a day and date: ${JSON.stringify(dateText)}`);
    const timeText = textOf(innerOf(tr, 'span', `${prefix}TimeLabel`) ?? '');
    const time = clock24(timeText);
    if (timeText !== '' && time === null) throw new TeamsidelineParseError(`${grid}: not a time: ${JSON.stringify(timeText)}`);
    const link = new RegExp(`<a\\b[^>]*id="${prefix}LocationLink"[^>]*>`).exec(tr)?.[0] ?? null;
    const href = link ? /\bhref="([^"]*)"/.exec(link)?.[1] ?? null : null;
    const location = textOf(innerOf(tr, 'span', `${prefix}ScheduleLabel`) ?? '') || null;
    const gameLabel = grid === 'PlayoffGrid' ? textOf(innerOf(tr, 'span', `${prefix}GameLabel`) ?? '') || null : null;
    if (grid === 'PlayoffGrid' && gameLabel === null) throw new TeamsidelineParseError(`${grid}: a playoff row with no game label`);
    games.push({
      band,
      monthDay: md[1],
      time,
      home: sideOf(tr, prefix, 'Home'),
      away: sideOf(tr, prefix, 'Away'),
      location,
      locationUrl: href ? decodeEntities(href, BASIC_NAMED) : null,
      comments: [],
      gameLabel,
    });
  }
  return games;
}

const int = (text: string, what: string): number => {
  if (!/^\d+$/.test(text)) throw new TeamsidelineParseError(`standings: ${what} is not a count: ${JSON.stringify(text)}`);
  return Number(text);
};

function standingsOf(html: string): TeamsidelineStandingRow[] {
  const tableId = `${GRID}standingsGrid_ctl00`;
  const start = html.indexOf(`id="${tableId}"`);
  if (start < 0) throw new TeamsidelineParseError('no standings grid');
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end < 0 ? html.length : end);
  const heads = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
  const col = (name: string): number => heads.indexOf(name);
  for (const need of ['Place', 'Team', 'W', 'L', 'T', 'GP']) {
    if (col(need) < 0) throw new TeamsidelineParseError(`standings: no ${need} column (${heads.join(', ')})`);
  }
  const rows: TeamsidelineStandingRow[] = [];
  for (const tr of table.split(/<tr\b/).slice(1)) {
    if (!/^[^>]*id="[^"]*standingsGrid_ctl00__\d+"/.test(tr)) continue;
    const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => textOf(m[1]));
    if (cells.length !== heads.length) throw new TeamsidelineParseError(`standings: a row of ${cells.length} cells under ${heads.length} heads`);
    const place = cells[col('Place')];
    const pts = col('PTS') >= 0 ? cells[col('PTS')] : null;
    rows.push({
      place: place === '' ? null : int(place, 'Place'),
      team: cells[col('Team')],
      w: int(cells[col('W')], 'W'),
      l: int(cells[col('L')], 'L'),
      t: int(cells[col('T')], 'T'),
      gp: int(cells[col('GP')], 'GP'),
      pts: pts === null ? null : int(pts, 'PTS'),
    });
  }
  return rows;
}

function tieBreakersOf(html: string): string[] {
  const i = html.indexOf('_TieBreakerTooltip1"');
  if (i < 0) return [];
  const block = html.slice(i, html.indexOf('</div>', i));
  // The page writes the list's markers raw ('1> Head-To-Head<br />2> Coin Toss'), or escaped.
  return [...block.matchAll(/\d+(?:>|&gt;)\s*([^<]+)/g)].map((m) => textOf(m[1]));
}

/** The whole page. Throws TeamsidelineParseError when it is not a schedule page or a row cannot be read. */
export function parseTeamsidelinePage(html: string): TeamsidelinePage {
  const title = textOf(/<div id="TitlePanel">[\s\S]*?<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
  if (title === '') throw new TeamsidelineParseError('no page heading: not a TeamSideline schedule page');
  const subtitle = textOf(innerOf(html, 'div', 'PageSubTitleSpan') ?? '');
  return {
    title,
    subtitle,
    tieBreakers: tieBreakersOf(html),
    standings: standingsOf(html),
    games: gridRows(html, 'ScheduleGrid'),
    playoffs: gridRows(html, 'PlayoffGrid'),
  };
}

/** A TeamSideline schedule page's URL on the league's own site: `${origin}/schedule/${id}/0/1/${slug}`. */
export function teamsidelineScheduleUrl(origin: string, scheduleId: string, slug: string): string {
  return `${origin}/schedule/${scheduleId}/0/1/${slug}`;
}
