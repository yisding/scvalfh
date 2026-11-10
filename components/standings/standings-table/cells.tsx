import type { StandingContext } from '../../../lib/data';
import { EM_DASH, placeWords, recordWords } from '../../../lib/format';
import { divisionHeading, leagueOfDivision } from '../../../lib/leagues';
import type { DivisionId, Standing, TeamSlug } from '../../../lib/types';

import MissingValue from '../../ui/MissingValue';
import PlaceMark from '../../ui/PlaceMark';
import { formStripName, plural } from '../../words/plural';

import type { StandingsColumn, StandingsRowData, StandingsTableProps } from './types';

/**
 * The cells and per-row words the faces of the league table share (PhoneStandingsTable,
 * DesktopStandingsTable, MiniStandingsTable, ArchiveStandingsTable), and the notes under it
 * (notes.tsx).
 */

/**
 * The league W-L-T, with a † after it when this team's record includes a score published from
 * si.com (SPEC §7.9). The † hangs: it is placed just past the record's last digit and takes no
 * width, so it sits in the cell's right padding (8px on a phone, 6/10px on desktop; the glyph is
 * about 8px of 13px mono) and a marked record's digits right-align with every other row's. As an
 * inline glyph it pushed them 7.8px left (8.4 from 1280) of the unmarked rows on /standings/pcal.
 */
export function LeagueRecord({ record, context }: { record: string; context: StandingContext | undefined }) {
  if (!context || context.backfilled === 0) return <>{record}</>;
  return (
    <>
      <span className="relative">
        {record}
        <span aria-hidden="true" className="absolute left-full">
          &dagger;
        </span>
      </span>
      <span className="sr-only">
        {context.backfilled === 1
          ? ', includes 1 score via si.com'
          : `, includes ${context.backfilled} scores via si.com`}
      </span>
    </>
  );
}

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
 * The colour comes from the cell (rank is ink-3 in every variant). '1', 'T7' for a shared place,
 * an em dash for a team with no reported results. `whitespace-nowrap`: the phone and mini place
 * column is 20px of content at 320 and "T7" is ~16px of 13px mono, so it must never break into
 * a "T" over a "7".
 */
export function PlaceCell({ standing }: { standing: Standing }) {
  return (
    <PlaceMark
      place={standing.computed.place}
      shared={standing.tiebreak.shared}
      ranked={standing.hasReportedResults}
      className="sx-num"
    />
  );
}

/**
 * The ⚑ beside a team name. It is `aria-hidden` and paired with an sr-only sentence, because the
 * glyph alone means nothing read aloud and the detail lives in a footnote under the table.
 */
export function FlagMark({ name }: { name: string }) {
  return (
    <>
      {/* -ml-1: the flag hugs the name (4px, not the row's 8px gap), which is the last few pixels
          a flagged "Monta Vista" needs to stay whole in the 320px phone row. */}
      <span className="-ml-1 shrink-0 text-ink-3" aria-hidden="true">
        &#9873;
      </span>
      <span className="sr-only">
        Flagged: MaxPreps publishes a different row for {name}; see the notes under this table.
      </span>
    </>
  );
}

/**
 * A column-head abbreviation: the short form is what a sighted reader scans ("GF"), the long form
 * is what a screen reader announces with every cell it reaches in that column ("Goals for") —
 * a bare "G F" or "P C T" spelled out on every cell is noise. The sr-only span is
 * `position: absolute`, so the `<th>` holding it must be positioned: every sticky head already
 * is; a static one (the mini table's) carries `relative`.
 */
export function Abbr({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{long}</span>
    </>
  );
}

export function dash(value: number | null, hasResults: boolean, render = (v: number) => String(v)) {
  if (!hasResults || value === null) return EM_DASH;
  return render(value);
}

/** The row link's name (StretchedRowLink, components/ui/PinNote.tsx), after the pin note. */
export function rowLabel(row: StandingsRowData): string {
  const { standing, team } = row;
  if (!standing.hasReportedResults) return `${team.name}: no results reported yet`;
  const place = placeWords(standing.computed.place, standing.tiebreak.shared);
  // The record in WORDS: "4-1-0" read aloud is a subtraction or a date, depending on the voice.
  return `${team.name}, ${place} in ${tableName(team.division)}, ${recordWords(
    standing.computed,
  )}, ${plural(standing.computed.pts, 'point')}`;
}

/** The ⚑ mark, shown on any row MaxPreps publishes differently. */
export function isFlagged(row: StandingsRowData, flagged: Set<TeamSlug>): boolean {
  return row.standing.mismatch || flagged.has(row.team.slug);
}

/**
 * No results: a `·` on the zero rule plus an em dash, with the words for a screen reader. The home
 * page's mini table (components/home/MiniStandings.tsx) renders the same cell.
 */
export function NoGoalDiff() {
  return (
    <span className="sx-num text-ink-3">
      <MissingValue words="no goal differential" glyph={`· ${EM_DASH}`} />
    </span>
  );
}

/** What the table bodies derive from the props before rendering a row. */
export function tableRows(props: StandingsTableProps) {
  const { berthRuleAfter } = props;
  const flagged = new Set<TeamSlug>(props.flaggedSlugs ?? []);
  const context = props.context;
  const columns = new Set<StandingsColumn>(context ? (props.columns ?? []) : []);
  const ctx = (row: StandingsRowData) => context?.get(row.team.id);
  // Every row of a table shares its division's schedule, so one null `scheduled` means none is fixed.
  const fixedSchedule = props.rows.every((row) => ctx(row)?.scheduled !== null);

  // The pinned team's 2px accent left rule has one channel. The pages are static and the pin lives
  // in localStorage, so every row carries `data-team-slug`, and the pinned-team head script
  // (components/prefs/pinned-team-script.ts, run from app/layout.tsx's <head>; then
  // components/prefs/PinnedTeamMarks.tsx after a client navigation) sets `[data-pinned]` on the
  // matching row.
  // The 2px automatic-qualifier cut: the one deliberately strong line in the table.
  const cut = (index: number) =>
    berthRuleAfter && index + 1 === berthRuleAfter
      ? { borderBottom: '2px solid var(--sx-border-strong)' }
      : undefined;
  const hrefOf = (row: StandingsRowData) => row.href ?? `/teams/${row.team.slug}`;
  const formLabel = (row: StandingsRowData) =>
    formStripName(row.team.name, row.standing.computed.last5.length);
  return { flagged, columns, ctx, fixedSchedule, cut, hrefOf, formLabel };
}
