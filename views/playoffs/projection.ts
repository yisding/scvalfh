/**
 * The /playoffs CCS projection (SPEC §6.1, §10.7): one table per division with a labelled
 * separator after the division's ladder line, and the status words a team row and the team page's
 * playoff line print.
 *
 * Pure, like every playoffs view module (key-dates, projection, pairings, tournament): no `fs` and no
 * `lib/queries/`. The pages read the snapshot and hand plain records down, so every builder here is
 * testable and safe anywhere. Server-only: no client component imports this module.
 *
 * CCS (SPEC §6.1, §10.7): the field is 16 teams, numbers only. Every CCS league qualifies by its own
 * LADDER (config): SCVAL's first three per division plus a 4th-place play-in, BVAL's Mt. Hamilton
 * 1st-3rd plus a play-in at the Santa Teresa champion, PCAL's top two. There is no merged 1-16 order:
 * no rule ranks a De Anza team against a Mt. Hamilton team, so the projection is one table per
 * division with a labelled separator after the division's `ladderLine`.
 *
 * Uncomputable steps (SCVAL Article VI §7's coin flip, BVAL §6f, PCAL §23.3's blind draw) leave
 * teams level (`tiebreak.shared`), and every consequence of that is derived here rather than
 * assumed: a shared last automatic place means more teams than berths, a shared play-in place leaves
 * the play-in unsettled, a shared at-large place means more than one at-large candidate. The ladder
 * facts that drive those sentences (how many automatic places, which place plays in, on what date)
 * come from config through `LadderFacts`, never from a literal.
 */

import { getDivision, ladderFor, leagueOfDivision } from '@/lib/config/leagues';
import { monthDay } from '@/lib/format/dates';
import { ordinalWord, placeWords, recordString, recordWords } from '@/lib/format/numbers';
import { EM_DASH, listWords, numberWord, plural } from '@/lib/format/words';
import type { DivisionId } from '@/lib/model/ids';
import type { PlayoffStatus, Standing } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { membershipSource } from '@/views/shared/words/membership';

export interface ProjectionRow {
  team: Team;
  standing: Standing;
  /** The best status the team can take — `statuses[0]`. */
  status: PlayoffStatus;
  /**
   * Every status still open to the team, best first. A level place spans as many finishing slots
   * as the tied group has teams, so two teams level on 3rd hold the third automatic berth AND the
   * 4th-place play-in spot between them. Grouping on `status` alone would make that play-in slot
   * vanish from the division.
   */
  statuses: PlayoffStatus[];
  /** The WRITTEN status from lib/queries/postseason.ts' projection — never a percentage (DESIGN §7.11). */
  label: string;
  /** This place is shared with another team and we render them level. */
  shared: boolean;
}

/**
 * The division's ladder, as config states it (`ladderFor`, `ladderLine`, the league's pairings and
 * `rules.unresolvedSuffix`). Passed in, so this module never reads config itself.
 */
export interface LadderFacts {
  /** Number of automatic-qualifier places in this division (SCVAL 3, Mt. Hamilton 3, Santa Teresa 0, PCAL 2). */
  aqPlaces: number;
  /** The place that plays in, or null (PCAL). SCVAL and Mt. Hamilton 4, Santa Teresa 1. */
  playInPlace: number | null;
  /** The play-in's date as 'Oct 30', or null. */
  playInDate: string | null;
  /** The at-large place, when the league's ladder names one (SCVAL 5), else null. */
  atLargePlace: number | null;
  /** The ladder line: a labelled separator row after the row(s) holding this status. */
  line: { status: PlayoffStatus; label: string } | null;
  /** 'Article VI §7 decides it with a coin flip' — `rules.unresolvedSuffix` without its dash. */
  unresolved: string;
}

/**
 * The division's `LadderFacts` from config: the rungs that apply to it (`ladderFor`), its
 * `ladderLine`, the league pairing that seats its play-in place, and the league's unresolved suffix.
 */
export function ladderFactsFor(division: DivisionId): LadderFacts {
  const d = getDivision(division);
  const league = leagueOfDivision(division);
  const rungs = ladderFor(division);
  const rung = (status: PlayoffStatus) => rungs.find((r) => r.status === status);
  const aq = rung('aq');
  const playIn = rung('play-in');
  const atLarge = rung('at-large');
  const pairings = league.postseason.kind === 'ccs-ladder' ? league.postseason.pairings : [];
  const playInPlace = playIn ? playIn.places[0] : null;
  const pairing =
    playInPlace === null
      ? undefined
      : pairings.find((p) => p.isPlayIn && p.seats.some((s) => s.division === division && s.place === playInPlace));
  // Every CCS and tournament division draws a line; only an unbracketed league's may be null (EAL),
  // and it never reaches /playoffs' ladders.
  const ladderLine = d.ladderLine;
  const lineRung = ladderLine
    ? rungs.find((r) => r.places[0] <= ladderLine.after && ladderLine.after <= r.places[1])
    : undefined;
  return {
    aqPlaces: aq ? aq.places[1] - aq.places[0] + 1 : 0,
    playInPlace,
    playInDate: pairing ? monthDay(pairing.date) : null,
    atLargePlace: atLarge ? atLarge.places[0] : null,
    line: lineRung && ladderLine ? { status: lineRung.status, label: ladderLine.label } : null,
    unresolved: league.rules.unresolvedSuffix.replace(/^—\s*/, ''),
  };
}

export interface DivisionProjection {
  division: DivisionId;
  /** 'De Anza' — or the league's short name for a single-division league ('PCAL'). */
  divisionLabel: string;
  rows: ProjectionRow[];
  /** Rows currently holding one of the division's automatic berths. */
  autoRows: ProjectionRow[];
  playInRows: ProjectionRow[];
  atLargeRows: ProjectionRow[];
  /** 1-based row index after which the labelled ladder line is drawn. 0 ⇒ no line. */
  lineAfter: number;
  /** 'AQ line' / 'Play-in host'; null when no line is drawn. */
  lineLabel: string | null;
  /** One sentence per tied group, and one per by-law consequence of a tie. */
  notes: string[];
}

/** The per-tied-group footnote. `tiebreak.note` already cites the by-law, so it renders verbatim. */
export function sharedGroupNotes(rows: ReadonlyArray<{ team: Team; standing: Standing }>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (!row.standing.tiebreak.shared) continue;
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
 * `rows` must already be in place order (that is what `getPlayoffProjection` returns). The line
 * follows the LAST row holding the line's status rather than a hardcoded place, so a shared last
 * automatic place — four teams, three berths — still draws the line where the data puts it.
 */
export function buildDivisionProjection(
  division: DivisionId,
  divisionLabel: string,
  rows: ProjectionRow[],
  ladder: LadderFacts,
): DivisionProjection {
  const holds = (row: ProjectionRow, status: PlayoffStatus) => row.statuses.includes(status);
  const autoRows = rows.filter((r) => holds(r, 'aq'));
  const playInRows = ladder.playInPlace !== null ? rows.filter((r) => holds(r, 'play-in')) : [];
  const atLargeRows = rows.filter((r) => holds(r, 'at-large'));

  let lineAfter = 0;
  if (ladder.line) {
    for (const [index, row] of rows.entries()) {
      if (holds(row, ladder.line.status)) lineAfter = index + 1;
    }
  }

  const notes = sharedGroupNotes(rows.filter((r) => r.shared));
  const anyResults = rows.some((r) => r.standing.hasReportedResults);
  const base = { division, divisionLabel, rows, autoRows, playInRows, atLargeRows };

  if (!anyResults) {
    // Preseason, or a division the source has not reported at all: there is nothing to project and
    // the play-in notes below would be false rather than merely empty.
    // A league with no documents of its own (`official.mode: 'none'`) publishes no alignment. "As
    // MaxPreps lists it" only where MaxPreps' table for this division lists every row (the EAL);
    // otherwise the league's membership source (views/shared/words/membership.ts).
    const source = membershipSource(division, rows.map((r) => r.team.slug));
    const roster =
      source.kind === 'maxpreps'
        ? `the ${divisionLabel} table as MaxPreps lists it`
        : source.kind === 'official'
          ? 'the official alignment'
          : `the ${divisionLabel} teams (${source.source})`;
    notes.push(
      `No ${divisionLabel} league results have been reported yet, so there is nothing to project ` +
        `here. The rows below are ${roster}.`,
    );
    return { ...base, lineAfter: 0, lineLabel: null, notes };
  }

  const n = ladder.aqPlaces;
  if (n > 0 && autoRows.length > n) {
    // Name only the level teams contesting the last automatic place, not the clear leaders above.
    const level = autoRows.filter((r) => r.shared);
    notes.push(
      `${listWords((level.length > 1 ? level : autoRows).map((r) => r.team.name))} share the last of the ` +
        `top ${numberWord(n)} places, and ${divisionLabel} has only ${numberWord(n)} automatic berths — ` +
        `${ladder.unresolved}, so this row order is not a ruling.`,
    );
  }
  if (ladder.playInPlace !== null) {
    const place = ordinalWord(ladder.playInPlace);
    const when = ladder.playInDate ? ` ${ladder.playInDate}` : '';
    if (playInRows.length === 0) {
      notes.push(
        `No ${divisionLabel} team is ${place} on its own today, so the${when} play-in pairing is not ` +
          'settled: the tie above it has to break first.',
      );
    } else if (playInRows.length > 1) {
      // Two teams can both hold the play-in spot two ways: level ON the play-in place, or level on
      // the place above with the group spanning both. A single-status row is unambiguously at the
      // play-in place; a row carrying more than one status straddles the boundary.
      const allAtPlace = playInRows.every((r) => r.statuses.length === 1);
      notes.push(
        `${listWords(playInRows.map((r) => r.team.name))} ${
          allAtPlace ? `are level at ${place}` : `are level across ${place}`
        }, so which of them plays in${when ? ` on${when}` : ''} is not settled — ${ladder.unresolved}.`,
      );
    }
  }
  if (ladder.atLargePlace !== null && atLargeRows.length > 1) {
    const allAtPlace = atLargeRows.every((r) => r.statuses.length === 1);
    const place = ordinalWord(ladder.atLargePlace);
    notes.push(
      allAtPlace
        ? `${listWords(atLargeRows.map((r) => r.team.name))} are level at ${place}, so ` +
          `${divisionLabel} has two at-large candidates and no ${ordinalWord(ladder.atLargePlace + 1)} place today.`
        : `${listWords(atLargeRows.map((r) => r.team.name))} are level across ${place}, so ` +
          `${divisionLabel} has more than one at-large candidate today.`,
    );
  }
  return {
    ...base,
    lineAfter,
    lineLabel: lineAfter > 0 && ladder.line ? ladder.line.label : null,
    notes,
  };
}

/** '4-1-0 · 12 pts', or an em dash for a team with nothing reported (never 0-0-0). */
export function recordLine(standing: Standing): string {
  if (!standing.hasReportedResults) return EM_DASH;
  return `${recordString(standing.computed)} · ${standing.computed.pts} pts`;
}

/**
 * A status label's chip text and its tail: "Play-in game Oct 30 — a coin flip decides it" is the
 * head "Play-in game Oct 30" and the tail "a coin flip decides it". The chip shows the head;
 * /playoffs prints the tail under it, and the team page leaves it to the tiebreak note.
 */
export function splitStatusLabel(label: string): { head: string; tail: string | null } {
  const [head, ...rest] = label.split(' — ');
  return { head, tail: rest.length > 0 ? rest.join(' — ') : null };
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
  const place = placeWords(standing.computed.place, row.shared);
  // The record in words, as on the standings table: "4-1-0" read aloud is a subtraction or a date.
  return `${team.name}, ${place} in ${divisionLabel}, ${recordWords(standing.computed)}, ${plural(
    standing.computed.pts,
    'point',
  )}`;
}
