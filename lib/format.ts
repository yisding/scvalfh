/**
 * Formatting. Every string the site shows is America/Los_Angeles (DESIGN §10.11).
 *
 * `Game.dateLocal` is ALREADY naive America/Los_Angeles school time, so the date and time
 * formatters below do pure string/integer arithmetic on it and never construct a Date from it.
 * That matters: `new Date('2026-09-29T16:00:00')` is parsed in the RUNNING MACHINE's zone, which
 * would make the build machine's TZ leak into the HTML. Intl.DateTimeFormat with
 * `timeZone: 'America/Los_Angeles'` is used for the one thing that genuinely is an instant —
 * converting `snapshot.fetchedAt` (ISO UTC) into a local date — via `zonedParts`.
 */

import { TIME_ZONE } from './season';
import type { Game, Outcome, Record3, ScoreView } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** U+2212 MINUS SIGN — the typographic minus the design uses for negative differentials. */
export const MINUS = '−';
/** U+2013 EN DASH — the "no score" glyph (DESIGN §5.3). */
export const EN_DASH = '–';
/** U+2014 EM DASH — the "no value at all" glyph in tables. */
export const EM_DASH = '—';

export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Split a naive local timestamp or a plain date key. Throws on anything else. */
export function parseLocal(value: string): DateParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (!m) throw new Error(`format: not a local timestamp: ${value}`);
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? '0'),
    minute: Number(m[5] ?? '0'),
    second: Number(m[6] ?? '0'),
  };
}

/** 0 = Sunday. Computed through Date.UTC so no local zone can shift it. */
export function weekdayIndex(value: string): number {
  const { year, month, day } = parseLocal(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** 'YYYY-MM-DD' — the URL key for /scores/[date] (SPEC §4, DESIGN §1.1). */
export function isoDateKey(value: string): string {
  const { year, month, day } = parseLocal(value);
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 'Tue Sep 29' */
export function shortDate(value: string): string {
  const p = parseLocal(value);
  return `${WEEKDAYS[weekdayIndex(value)]} ${MONTHS[p.month - 1]} ${p.day}`;
}

/** 'Sep 29' */
export function monthDay(value: string): string {
  const p = parseLocal(value);
  return `${MONTHS[p.month - 1]} ${p.day}`;
}

/** 'Tuesday, September 29' */
export function longDate(value: string): string {
  const p = parseLocal(value);
  return `${WEEKDAYS_LONG[weekdayIndex(value)]}, ${MONTHS_LONG[p.month - 1]} ${p.day}`;
}

/** 'Sep 29, 2026' */
export function dateWithYear(value: string): string {
  const p = parseLocal(value);
  return `${MONTHS[p.month - 1]} ${p.day}, ${p.year}`;
}

/**
 * The five shapes a partial date takes in the hand-researched files (data/clubs.json's `asOf`,
 * lib/clubs-schema.ts `isAsOf`): a day, a month, a year, a season ("2025-26": the second year is
 * the first + 1) or a range of years ("2015-2018"). `YYYY-MM` is a month when MM is 01-12 and a
 * season otherwise, the order isAsOf reads it in; the two can only collide before 2012.
 */
export type PartialDateKind = 'day' | 'month' | 'year' | 'season' | 'range';

/** Which of the five shapes `value` is. Throws on anything else ("2025-27", "2025/26"). */
export function partialDateKind(value: string): PartialDateKind {
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return 'day';
  if (/^\d{4}$/.test(value)) return 'year';
  const short = /^(\d{4})-(\d{2})$/.exec(value);
  if (short) {
    const [year, tail] = [Number(short[1]), Number(short[2])];
    if (tail >= 1 && tail <= 12) return 'month';
    if (tail === (year + 1) % 100) return 'season';
  }
  const range = /^(\d{4})-(\d{4})$/.exec(value);
  if (range && Number(range[1]) <= Number(range[2])) return 'range';
  throw new Error(`format: not a partial date: ${value}`);
}

/**
 * A partial date in words, pure string work like `dateWithYear`: 'Jul 8, 2026', 'Oct 2025',
 * '2025', '2025-26 season', '2015–2018' (an en dash between the years). Throws on any other shape.
 */
export function partialDate(value: string): string {
  switch (partialDateKind(value)) {
    case 'day':
      return dateWithYear(value);
    case 'month':
      return `${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
    case 'year':
      return value;
    case 'season':
      return `${value} season`;
    case 'range':
      return value.replace('-', EN_DASH);
  }
}

/** The school year's words; anything else is printed as its number. */
export const GRADE_WORDS = { 9: 'Freshman', 10: 'Sophomore', 11: 'Junior', 12: 'Senior' } as const;

/** 'Freshman' … 'Senior' for grades 9-12, 'Grade 8' otherwise (the roster and the club pages). */
export function gradeWord(grade: number): string {
  return GRADE_WORDS[grade as keyof typeof GRADE_WORDS] ?? `Grade ${grade}`;
}

/** '4:00 PM' */
export function timeOfDay(value: string): string {
  const { hour, minute } = parseLocal(value);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${suffix}`;
}

/**
 * '5:30' — the clock face alone, for the narrow leading column of a dense row (DESIGN §3.3's
 * wireframe writes `5:30`, not `5:30 PM`). Every such row also carries the full `4:00 PM PT` in
 * its screen-reader sentence, and a scheduled game repeats it in the status label beside the
 * score, so the meridiem is never the only place the reader can find it.
 */
export function clockTime(value: string): string {
  const { hour, minute } = parseLocal(value);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)}`;
}

/** '4:00 PM PT' — every time on the site is labelled PT (DESIGN §10.11). */
export function timeOfDayPT(value: string): string {
  return `${timeOfDay(value)} PT`;
}

/** The value for a `<time datetime>` attribute. */
export function dateTimeAttr(game: Pick<Game, 'dateLocal' | 'dateUtc' | 'isTimeTba'>): string {
  return game.isTimeTba ? isoDateKey(game.dateLocal) : game.dateUtc;
}

/** 'Tue Sep 29, 4:00 PM PT', or just the date when the time is TBA. */
export function gameWhen(game: Pick<Game, 'dateLocal' | 'isTimeTba' | 'isDateTba'>): string {
  if (game.isDateTba) return 'Date TBA';
  if (game.isTimeTba) return `${shortDate(game.dateLocal)}, time TBA`;
  return `${shortDate(game.dateLocal)}, ${timeOfDayPT(game.dateLocal)}`;
}

// ---------------------------------------------------------------- instants

/** An ISO UTC instant, expressed in America/Los_Angeles. This is the only Intl use here. */
export function zonedParts(instantIso: string): DateParts {
  const at = new Date(instantIso);
  if (Number.isNaN(at.getTime())) throw new Error(`format: not an instant: ${instantIso}`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const found: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour),
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/** An ISO UTC instant → the naive America/Los_Angeles timestamp for it. */
export function toLocalTimestamp(instantIso: string): string {
  const p = zonedParts(instantIso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** An ISO UTC instant → 'YYYY-MM-DD' in America/Los_Angeles. This is how "today" is derived. */
export function localDateKey(instantIso: string): string {
  const p = zonedParts(instantIso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 'Tue Sep 29, 4:00 PM PT' for a snapshot stamp. */
export function formatStamp(instantIso: string): string {
  const local = toLocalTimestamp(instantIso);
  return `${shortDate(local)}, ${timeOfDayPT(local)}`;
}

/** Whole hours between two instants — drives the >36 h stale-snapshot state (DESIGN §7.15). */
export function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / 3_600_000;
}

// ---------------------------------------------------------------- records & numbers

/** 'W-L-T', e.g. '4-1-0'. */
export function recordString(r: Record3 | { w: number; l: number; t: number }): string {
  return `${r.w}-${r.l}-${r.t}`;
}

/**
 * '5 wins, 1 loss, 0 ties' — the record in words, for a screen-reader label. '4-1-0' read aloud
 * is "four minus one minus zero" in some voices and a date in others; the words are unambiguous.
 */
export function recordWords(r: Record3 | { w: number; l: number; t: number }): string {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `${count(r.w, 'win', 'wins')}, ${count(r.l, 'loss', 'losses')}, ${count(r.t, 'tie', 'ties')}`;
}

/** '+30' / '−24' / '0' — always signed, U+2212 for negatives (DESIGN §5.6). */
export function signedGd(gd: number | null): string {
  if (gd === null) return EM_DASH;
  if (gd === 0) return '0';
  return gd > 0 ? `+${gd}` : `${MINUS}${Math.abs(gd)}`;
}

/** '.625' / '1.000' / '.000' — the leading zero is dropped, sports-table convention. */
export function winPct(value: number): string {
  const s = value.toFixed(3);
  return s.startsWith('0.') ? s.slice(1) : s;
}

/** '0.0' for a genuine zero, em dash for nothing reported (DESIGN §8). */
export function perGame(total: number | null, gp: number): string {
  if (total === null || gp === 0) return EM_DASH;
  return (total / gp).toFixed(1);
}

/** '1st', '2nd', '3rd', '4th', '11th', '21st'. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const ORDINAL_WORDS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** 'fourth' for 4; '11th' past ten. */
export function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n] ?? ordinal(n);
}

/** The rank cell: '1st', or an em dash for a team with no reported results (DESIGN §8). */
export function ordinalPlace(place: number, hasResults = true): string {
  return hasResults ? ordinal(place) : EM_DASH;
}

/** A real 0 is '0'; a null is an en dash (DESIGN §5.3). NEVER coerce. */
export function scoreGlyph(score: number | null): string {
  return score === null ? EN_DASH : String(score);
}

export const OUTCOME_WORDS: Record<Outcome, string> = { W: 'win', L: 'loss', T: 'tie' };

/** 'Last 5 league games: loss, loss, win.' — one sentence, never five letters (DESIGN §10.6). */
export function formStripLabel(last5: readonly Outcome[]): string {
  if (last5.length === 0) return 'No league results yet.';
  const words = last5.map((o) => OUTCOME_WORDS[o]).join(', ');
  return `Last ${last5.length} league game${last5.length === 1 ? '' : 's'}, oldest first: ${words}.`;
}

/** 'W5' / 'L3' / 'T1' (the US sports-page order: result, then length), or an em dash. */
export function streakString(streak: { count: number; result: Outcome } | null): string {
  return streak ? `${streak.result}${streak.count}` : EM_DASH;
}

// ---------------------------------------------------------------- score rendering

/**
 * One side's W/L/T in a final, or null unless the game is final with both scores. THE single
 * derivation every outcome on the site goes through (standings, form, chips, series summaries):
 * a stored shootout tally decides when present; a decider 'SO' with complementary result flags
 * {W, L} (an EAL 1 v 1 win: level on goals, no tally stored) takes that side's flag; anything
 * else is read off the score. League-free on purpose: `decider` 'SO' is only ever written by
 * lib/normalize.ts for two members of a shootout league, so nothing here needs the config.
 */
export function sideOutcome(
  game: Pick<Game, 'status' | 'home' | 'away' | 'decider' | 'shootout'>,
  side: 'home' | 'away',
): Outcome | null {
  if (game.status !== 'final' || game.home.score === null || game.away.score === null) return null;
  const [mine, theirs] = side === 'home' ? [game.home, game.away] : [game.away, game.home];
  if (game.shootout) {
    const [us, them] =
      side === 'home'
        ? [game.shootout.home, game.shootout.away]
        : [game.shootout.away, game.shootout.home];
    return us > them ? 'W' : 'L';
  }
  if (
    game.decider === 'SO' &&
    (mine.result === 'W' || mine.result === 'L') &&
    theirs.result === (mine.result === 'W' ? 'L' : 'W')
  ) {
    return mine.result;
  }
  const [us, them] = [mine.score as number, theirs.score as number];
  return us > them ? 'W' : us < them ? 'L' : 'T';
}

/**
 * The single place the never-0-0 rule lives (DESIGN §5.2). Nothing else in the UI should read
 * `home.score` / `away.score` directly. `outcome` is relative to the HOME side (`sideOutcome`).
 */
export function renderScore(g: Game): ScoreView {
  if (g.status === 'postponed') return { kind: 'postponed', newDate: null };
  if (g.status === 'score-pending') return { kind: 'unreported' };
  if (g.status === 'live') return { kind: 'live' };
  const outcome = sideOutcome(g, 'home');
  if (outcome === null || g.home.score === null || g.away.score === null) {
    return { kind: 'scheduled', time: g.isTimeTba ? null : timeOfDay(g.dateLocal) };
  }
  return {
    kind: 'final',
    home: g.home.score,
    away: g.away.score,
    outcome,
    decider: g.decider ?? 'REG',
    shootout: g.shootout,
  };
}

/**
 * 'Saint Francis 7, Homestead 0, final.' — the screen-reader sentence (DESIGN §10.6). A final
 * decided on 1 v 1s with no stored tally (decider 'SO') names the winner instead:
 * 'Chico 1, Davis 1, final; Chico won on 1 v 1s.' `quietOvertime` drops " after overtime" (the
 * view sets it when MaxPreps' overtime count cannot be right for the league).
 */
export function scoreSentence(g: Game, opts: { quietOvertime?: boolean } = {}): string {
  const view = renderScore(g);
  switch (view.kind) {
    case 'final': {
      const head = `${g.home.name} ${view.home}, ${g.away.name} ${view.away}, final`;
      if (view.decider === 'SO' && view.shootout === null && view.outcome !== 'T') {
        return `${head}; ${view.outcome === 'W' ? g.home.name : g.away.name} won on 1 v 1s.`;
      }
      return `${head}${
        !opts.quietOvertime && (view.decider === 'OT' || view.decider === '2OT') ? ' after overtime' : ''
      }${view.decider === 'FORFEIT' ? ' by forfeit' : ''}.`;
    }
    case 'unreported':
      return `${g.away.name} at ${g.home.name}: score not reported.`;
    case 'live':
      return `${g.away.name} at ${g.home.name}: in progress.`;
    case 'postponed':
      return `${g.away.name} at ${g.home.name}: postponed.`;
    case 'scheduled':
      return `${g.away.name} ${g.site === 'neutral' ? 'vs' : 'at'} ${g.home.name}: ${
        view.time ? `${view.time} PT` : 'time to be announced'
      }.`;
  }
}

/** 'vs' for a home or neutral game, 'at' for an away game, from one team's point of view. */
export function versusLabel(game: Game, teamId: string): 'vs' | 'at' {
  if (game.site === 'neutral') return 'vs';
  return game.home.teamId === teamId ? 'vs' : 'at';
}

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
] as const;

/** 'zero' … 'ten' for a whole number 0-10, its digits otherwise ('six', '49'). */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 10 ? NUMBER_WORDS[n] : String(n);
}

/**
 * An inclusive span of two date keys with an en dash: 'Oct 30–31' within a month,
 * 'Oct 30–Nov 1' across one, 'Oct 30' when both are the same day.
 */
export function dateSpan(first: string, last: string): string {
  const a = parseLocal(first);
  const b = parseLocal(last);
  if (a.year === b.year && a.month === b.month) {
    return a.day === b.day ? monthDay(first) : `${monthDay(first)}${EN_DASH}${b.day}`;
  }
  return `${monthDay(first)}${EN_DASH}${monthDay(last)}`;
}

/** 'A', 'A and B', 'A, B and C'. */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
