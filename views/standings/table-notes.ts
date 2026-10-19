/**
 * What the standings tables (components/standings/table/) say in words, as plain data: a row
 * link's sentence, the GP figure and its head's title, the table's name, and the division's
 * table-specific notes. The components only place these strings; StandingsNoteItem renders a
 * `NoteItem` with the markup each kind needs.
 */

import { leagueOfDivision } from '@/lib/config/leagues';
import { divisionHeading } from '@/lib/config/leagues/labels';
import { placeWords, recordWords } from '@/lib/format/numbers';
import { EM_DASH, plural } from '@/lib/format/words';
import type { DivisionId, TeamSlug } from '@/lib/model/ids';
import type { StandingContext } from '@/lib/queries/standings';
import { articleFor, membershipSource } from '@/views/shared/words/membership';

import type { StandingsRowData } from './types';

/**
 * `6/12` games counted of the division's scheduled league games, or the bare count (`6`) in a league
 * with no fixed schedule (the Sunset, `scheduled` null: DESIGN-socal §2.1.7), which has no "of N".
 */
export function gpText(context: StandingContext | undefined): string {
  if (!context) return EM_DASH;
  return context.scheduled === null ? `${context.counted}` : `${context.counted}/${context.scheduled}`;
}

/** The GP head's title: "of those scheduled" only where there is a schedule to count against. */
export function gpTitle(fixed: boolean): string {
  return fixed ? 'League games counted of those scheduled' : 'League games counted';
}

/** The division as a reader names it: its heading, or the league's short name for a one-table league. */
export function tableName(division: DivisionId): string {
  return divisionHeading(division) ?? leagueOfDivision(division).shortName;
}

/**
 * What a row link's sentence needs, as plain values: a standings row gives them through
 * `tableRowLabel`, and the home page's mini table (views/home/mini-standings.ts `MiniRow`) carries
 * them as fields.
 */
export interface RowLabelFacts {
  name: string;
  hasResults: boolean;
  place: number;
  shared: boolean;
  /** '7 wins, 1 loss, 0 ties' */
  recordWords: string;
  pts: number;
}

/**
 * The stretched row link's accessible name: "Cupertino, 1st in De Anza, 4 wins, 0 losses, 0 ties,
 * 12 points", or "<name>: no results reported yet". `where` is the table's name (`tableName`).
 */
export function standingRowLabel(row: RowLabelFacts, where: string): string {
  if (!row.hasResults) return `${row.name}: no results reported yet`;
  const place = placeWords(row.place, row.shared);
  // The record in WORDS: "4-1-0" read aloud is a subtraction or a date, depending on the voice.
  return `${row.name}, ${place} in ${where}, ${row.recordWords}, ${plural(row.pts, 'point')}`;
}

/** `standingRowLabel` for one row of a standings table, named after the team's own division. */
export function tableRowLabel(row: StandingsRowData): string {
  const { standing, team } = row;
  return standingRowLabel(
    {
      name: team.name,
      hasResults: standing.hasReportedResults,
      place: standing.computed.place,
      shared: standing.tiebreak.shared,
      recordWords: recordWords(standing.computed),
      pts: standing.computed.pts,
    },
    tableName(team.division),
  );
}

/**
 * One table-specific note, as data (components/standings/table/StandingsNoteItem.tsx renders it):
 *  - `shared`: one tied group's tiebreak note, led by the first team's name in bold;
 *  - `no-results`: the team with no results, in a sentence;
 *  - `mismatch`: a `standing.mismatch` flag (⚑), its detail and the team's MaxPreps page;
 *  - `footnote`: one of the caller's `footnotes`, verbatim.
 */
export type NoteItem =
  | { kind: 'shared'; team: string; note: string }
  | { kind: 'no-results'; text: string }
  | { kind: 'mismatch'; team: string; detail: string; maxprepsUrl: string | null }
  | { kind: 'footnote'; text: string };

/**
 * The table's notes (brief §4.22): shared-place notes, the no-results team, `standing.mismatch`
 * flags and the caller's `footnotes` — facts about THIS division, which always stay visible. The
 * generic legend (GD, PTS) is the page's to print once (DivisionStandings, the standings page).
 *
 * `statedElsewhere`: teams whose MaxPreps difference the caller's Notes block already states in
 * its comparison list (StandingsNotes). Their `standing.mismatch` note is left out, so one fact is
 * not said twice in one list in two wordings.
 */
export function collectStandingsNotes(input: {
  rows: readonly StandingsRowData[];
  footnotes?: readonly string[];
  statedElsewhere?: readonly TeamSlug[];
}): NoteItem[] {
  const notes: NoteItem[] = [];
  const { rows } = input;
  // One note per TIED GROUP, not one per team: Cupertino's note and Homestead's note describe
  // the same coin flip. The note already cites Article VI §7, so it renders verbatim.
  const sharedGroups = new Map<string, NoteItem>();
  for (const row of rows) {
    if (!row.standing.tiebreak.shared) continue;
    const key = [row.standing.teamId, ...row.standing.tiebreak.tiedWith].sort().join('|');
    if (sharedGroups.has(key)) continue;
    sharedGroups.set(key, { kind: 'shared', team: row.team.name, note: row.standing.tiebreak.note });
  }
  for (const note of sharedGroups.values()) notes.push(note);
  for (const row of rows) {
    if (!row.standing.hasReportedResults) {
      // A league with no documents of its own (`official.mode: 'none'`) publishes no alignment, so
      // nothing says "official". "As MaxPreps lists it" only where MaxPreps' table for this division
      // lists the team (the EAL); otherwise the league's membership source is named (Newport
      // Harbor, Hilltop, Southwest: views/shared/words/membership.ts).
      const table = tableName(row.team.division);
      const source = membershipSource(row.team.division, [row.team.slug]);
      const is =
        source.kind === 'maxpreps'
          ? `is in the ${table} table as MaxPreps lists it`
          : source.kind === 'official'
            ? `is in the official ${table} alignment`
            : `is ${articleFor(table)} ${table} team (${source.source})`;
      notes.push({
        kind: 'no-results',
        text: `${row.team.name} ${is} but has no results in the source table — no record is invented for them.`,
      });
    }
    if (row.standing.mismatch && !input.statedElsewhere?.includes(row.team.slug)) {
      // The pipeline's detail ("overall record 3-2-3 vs MaxPreps 3-3-2") has no full stop.
      const detail = row.standing.mismatchDetail?.replace(/\.?$/, '.');
      notes.push({
        kind: 'mismatch',
        team: row.team.name,
        detail: detail ?? 'our computation differs from MaxPreps.',
        maxprepsUrl: row.team.external.maxprepsTeamUrl,
      });
    }
  }
  for (const extra of input.footnotes ?? []) notes.push({ kind: 'footnote', text: extra });
  return notes;
}
