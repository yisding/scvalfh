/**
 * The pure view model behind /playoffs. No `fs`, no `lib/data` — the page reads the snapshot and
 * hands plain records down, so every component here is testable and safe anywhere.
 *
 * The authority for this page is BYLAWS-ADDENDUM Article VII, not DESIGN §3.8's projection
 * wireframe, which predates the by-laws PDF:
 *
 *   - §1: the CCS field is 16 teams — SCVAL 7, BVAL 4, PCAL 2, at-large 3.
 *   - §2: the FIRST THREE IN EACH DIVISION are automatic qualifiers. The two fourth-place teams
 *     play a play-in on Fri Oct 30 and the winner takes the SCVAL 7th AQ. The losing 4th-place
 *     team and BOTH 5th-place teams go to CCS for at-large consideration.
 *
 * That makes the projection two per-division tables with a berth rule after the third row, NOT
 * the single merged 1-16 list with a rule after row 7 that DESIGN §3.8 drew: there is no by-law
 * that ranks a De Anza team against an El Camino team, so merging them would invent an order.
 *
 * Article VI §7 ends in a coin flip we cannot compute, so two or more teams can share a place
 * (`tiebreak.shared`). Every consequence of that is derived here rather than assumed: a shared
 * 3rd means four teams hold three berths, a shared 4th leaves the play-in pairing unsettled, and
 * a shared 5th means two at-large rows and NO 6th place. All three are real possibilities in this
 * data — today El Camino's 5th place is shared.
 */

import {
  EM_DASH,
  ordinal,
  recordString,
  shortDate,
  timeOfDayPT,
  weekdayIndex,
} from '../../lib/format';
import type {
  Division,
  PlayoffKeyDates,
  PlayoffStatus,
  Standing,
  Team,
} from '../../lib/types';

// ---------------------------------------------------------------- key dates

export type KeyDateKey =
  | 'crossover'
  | 'entries'
  | 'seeding'
  | 'quarterfinals'
  | 'semifinals'
  | 'finals'
  | 'evaluation';

export interface KeyDateRow {
  key: KeyDateKey;
  /** 'YYYY-MM-DD' — the `<time datetime>` value. */
  dateKey: string;
  /** 'Sat Nov 7' */
  date: string;
  /** '1:00 PM PT', or null for an all-day date. */
  time: string | null;
  label: string;
  detail: string;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** 'Saturday' for a local date or timestamp. */
export function weekdayName(value: string): string {
  return WEEKDAY_NAMES[weekdayIndex(value)];
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

/**
 * Every published key date, in order. The five CCS dates (Nov 2 / 7 / 11 / 14 / 19) come from the
 * CCS playoff-dates PDF and are cross-confirmed by the CCS iCal feed; the Oct 30 crossover comes
 * from the two official SCVAL schedule PDFs.
 */
export function keyDateRows(k: PlayoffKeyDates): KeyDateRow[] {
  return [
    {
      key: 'crossover',
      dateKey: dateOnly(k.crossover),
      date: shortDate(k.crossover),
      time: null,
      label: 'SCVAL crossover and play-in',
      detail:
        '#1 v #1, #2 v #2 and #3 v #3 to help CCS ordering, plus the 4-vs-4 play-in for the SCVAL 7th automatic berth.',
    },
    {
      key: 'entries',
      dateKey: dateOnly(k.entriesDue),
      date: shortDate(k.entriesDue),
      time: timeOfDayPT(k.entriesDue),
      label: 'CCS entries due',
      detail: 'Leagues submit their qualifiers and at-large candidates.',
    },
    {
      key: 'seeding',
      dateKey: dateOnly(k.seedingMeeting),
      date: shortDate(k.seedingMeeting),
      time: timeOfDayPT(k.seedingMeeting),
      label: 'CCS seeding meeting',
      detail: 'The committee seeds both divisions. This page fills in that evening.',
    },
    {
      key: 'quarterfinals',
      dateKey: dateOnly(k.quarterfinals),
      date: shortDate(k.quarterfinals),
      time: null,
      label: 'Quarterfinals',
      detail: 'Higher seed hosts.',
    },
    {
      key: 'semifinals',
      dateKey: dateOnly(k.semifinals),
      date: shortDate(k.semifinals),
      time: null,
      label: 'Semifinals',
      detail: 'Higher seed hosts.',
    },
    {
      key: 'finals',
      dateKey: dateOnly(k.finals),
      date: shortDate(k.finals),
      time: null,
      label: 'Finals',
      detail: 'Site set by CCS.',
    },
    {
      key: 'evaluation',
      dateKey: dateOnly(k.evaluationMeeting),
      date: shortDate(k.evaluationMeeting),
      time: timeOfDayPT(k.evaluationMeeting),
      label: 'CCS evaluation meeting',
      detail: 'The season review that closes the tournament.',
    },
  ];
}

export interface RoundTile {
  key: KeyDateKey;
  /** 'Nov 7' — short enough to hold the figure size at 107px of column. */
  value: string;
  /** 'Quarters' — the wireframe's tile label. */
  label: string;
  /** 'Saturday' */
  sub: string;
}

/** The three round tiles of the DESIGN §3.8 wireframe: QUARTERS / SEMIS / FINAL. */
export function roundTiles(k: PlayoffKeyDates): RoundTile[] {
  const tile = (key: KeyDateKey, iso: string, label: string): RoundTile => ({
    key,
    value: shortDate(iso).slice(4),
    label,
    sub: weekdayName(iso),
  });
  return [
    tile('quarterfinals', k.quarterfinals, 'Quarters'),
    tile('semifinals', k.semifinals, 'Semis'),
    tile('finals', k.finals, 'Final'),
  ];
}

// ---------------------------------------------------------------- projection

export interface ProjectionRow {
  team: Team;
  standing: Standing;
  /** The best status the team can take — `statuses[0]`. */
  status: PlayoffStatus;
  /**
   * Every status still open to the team, best first. A level place (Article VI §7) spans as many
   * finishing slots as the tied group has teams, so two teams level on 3rd hold the third
   * automatic berth AND the 4th-place play-in spot between them. Grouping on `status` alone would
   * make that play-in slot vanish from the division.
   */
  statuses: PlayoffStatus[];
  /** The WRITTEN status from lib/data's projection — never a percentage (DESIGN §7.11). */
  label: string;
  /** Article VI §7: this place is shared with another team and we render them level. */
  shared: boolean;
}

export interface DivisionProjection {
  division: Division;
  /** 'De Anza' */
  divisionLabel: string;
  rows: ProjectionRow[];
  /** Rows currently holding one of the division's three automatic berths. */
  autoRows: ProjectionRow[];
  playInRows: ProjectionRow[];
  atLargeRows: ProjectionRow[];
  /** 1-based row index after which the 2px berth rule is drawn. 0 ⇒ no rule. */
  berthRuleAfter: number;
  /** One sentence per tied group, and one per by-law consequence of a tie. */
  notes: string[];
}

/** 'Cupertino and Homestead' / 'Presentation, Santa Clara and Saratoga' */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The per-tied-group footnote. `tiebreak.note` already cites the article, so it renders verbatim. */
function sharedGroupNotes(rows: ProjectionRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (!row.shared) continue;
    const key = [row.standing.teamId, ...row.standing.tiebreak.tiedWith].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${row.team.name}: ${row.standing.tiebreak.note}`);
  }
  return out;
}

/**
 * Derive everything the projection table needs from the division's ranked rows.
 *
 * `rows` must already be in place order (that is what `getStandings` / `getPlayoffProjection`
 * return). The berth rule follows the LAST automatic-qualifier row rather than a hardcoded 3, so
 * a shared 3rd place — four teams, three berths — still draws the rule where the data puts it.
 */
export function buildDivisionProjection(
  division: Division,
  divisionLabel: string,
  rows: ProjectionRow[],
): DivisionProjection {
  const holds = (row: ProjectionRow, status: PlayoffStatus) => row.statuses.includes(status);
  const autoRows = rows.filter((r) => holds(r, 'aq'));
  const playInRows = rows.filter((r) => holds(r, 'play-in'));
  const atLargeRows = rows.filter((r) => holds(r, 'at-large'));

  let berthRuleAfter = 0;
  for (const [index, row] of rows.entries()) {
    if (holds(row, 'aq')) berthRuleAfter = index + 1;
  }

  const notes = sharedGroupNotes(rows);
  const anyResults = rows.some((r) => r.standing.hasReportedResults);

  if (!anyResults) {
    // Preseason, or a division the source has not reported at all: there is nothing to project and
    // the play-in notes below would be false rather than merely empty.
    notes.push(
      `No ${divisionLabel} league results have been reported yet, so there is nothing to project ` +
        'here. The rows below are the official alignment.',
    );
    return {
      division,
      divisionLabel,
      rows,
      autoRows,
      playInRows,
      atLargeRows,
      berthRuleAfter: 0,
      notes,
    };
  }

  if (autoRows.length > 3) {
    notes.push(
      `${joinNames(autoRows.map((r) => r.team.name))} are level inside the top three, and a ` +
        'division has only three automatic berths — Article VI §7 settles which team takes the ' +
        'third with a coin flip, so this row order is not a ruling.',
    );
  }
  if (playInRows.length === 0) {
    notes.push(
      `No ${divisionLabel} team is fourth on its own today, so the Oct 30 play-in pairing is not ` +
        'settled: the tie above it has to break first.',
    );
  } else if (playInRows.length > 1) {
    // Two teams can both hold the play-in spot two ways: level ON 4th, or level on 3rd with the
    // group spanning 3rd and 4th. A single-status row is unambiguously fourth; a row carrying
    // more than one status straddles the boundary, and only the first case means nobody is fifth.
    const allAtFourth = playInRows.every((r) => r.statuses.length === 1);
    notes.push(
      `${joinNames(playInRows.map((r) => r.team.name))} ${
        allAtFourth ? 'are level at fourth' : 'are level across fourth'
      }, so which of them plays in on Oct 30 is not settled — Article VI §7 decides it with a ` +
        'coin flip.',
    );
  }
  if (atLargeRows.length > 1) {
    const allAtFifth = atLargeRows.every((r) => r.statuses.length === 1);
    notes.push(
      allAtFifth
        ? `${joinNames(atLargeRows.map((r) => r.team.name))} are level at fifth, so ` +
          `${divisionLabel} has two at-large candidates and no sixth place today.`
        : `${joinNames(atLargeRows.map((r) => r.team.name))} are level across fifth, so ` +
          `${divisionLabel} has more than one at-large candidate today.`,
    );
  }
  return {
    division,
    divisionLabel,
    rows,
    autoRows,
    playInRows,
    atLargeRows,
    berthRuleAfter,
    notes,
  };
}

/** '4-1-0 · 12 pts', or an em dash for a team with nothing reported (never 0-0-0). */
export function recordLine(standing: Standing): string {
  if (!standing.hasReportedResults) return EM_DASH;
  return `${recordString(standing.computed)} · ${standing.computed.pts} pts`;
}

/**
 * The row link's accessible sentence: name, place, record, points. It deliberately omits the
 * written status, which is real text in its own cell — repeating it would announce it twice.
 */
export function projectionRowLabel(row: ProjectionRow, divisionLabel: string): string {
  const { standing, team } = row;
  if (!standing.hasReportedResults) {
    return `${team.name}: no results reported, not ranked in ${divisionLabel}`;
  }
  const place = row.shared
    ? `tied for ${ordinal(standing.computed.place)}`
    : ordinal(standing.computed.place);
  return `${team.name}, ${place} in ${divisionLabel}, ${recordString(standing.computed)}, ${
    standing.computed.pts
  } points`;
}

// ---------------------------------------------------------------- crossover

export interface CrossoverSide {
  /**
   * Everyone who could take this seed. Empty ⇒ the table does not reach it (TBD); one ⇒ settled;
   * two or more ⇒ a level place spans the seed and Article VI §7's coin flip decides it.
   */
  contenders: Array<{ team: Team; standing: Standing }>;
}

export interface CrossoverRow {
  seed: number;
  /** true for seed 4: the winner takes the SCVAL 7th automatic qualifier. */
  isPlayIn: boolean;
  deAnza: CrossoverSide;
  elCamino: CrossoverSide;
  /** True when either side has more than one contender, so the pairing is not settled. */
  unsettled: boolean;
}

/** 'the SCVAL 7th automatic berth' vs 'CCS seeding help' — what a crossover game is for. */
export const CROSSOVER_PURPOSE = {
  playIn:
    'The winner receives the SCVAL 7th automatic qualifier. The loser is submitted to CCS for at-large consideration.',
  ordering:
    'Played after the season to help the CCS committee order the two divisions. Home site by coin flip; it does not count toward a team’s maximum contests.',
} as const;
