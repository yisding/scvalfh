import type { CSSProperties } from 'react';

import MissingValue from '@/components/ui/MissingValue';
import PlaceMark from '@/components/ui/PlaceMark';
import { EM_DASH, formStripName } from '@/lib/format/words';
import type { DivisionId } from '@/lib/model/ids';
import type { Standing } from '@/lib/model/standings';
import type { StandingContext } from '@/lib/queries/standings';
import type { StandingsRowData } from '@/views/standings/types';

import type { StandingsColumn } from './desktop-columns';

/**
 * The cells and row facts the phone and desktop standings tables share (PhoneStandingsTable,
 * DesktopStandingsTable). StandingsTable computes `StandingsVariantProps` once per table and hands
 * the same object to whichever variant it renders.
 */
export interface StandingsVariantProps {
  division: DivisionId;
  /** Already sorted and ranked by lib/engine/standings.ts. */
  rows: readonly StandingsRowData[];
  /** max |gd| for THIS division — never global (R-2). */
  gdDomain: number;
  /** The extra columns that are on (only with a `context`). */
  columns: ReadonlySet<StandingsColumn>;
  /** Every row's division has a fixed league schedule, so GP reads "6/12" rather than "6". */
  fixedSchedule: boolean;
  /** The row's derived facts (`getStandingContext(division)`), if the caller passed them. */
  contextOf: (row: StandingsRowData) => StandingContext | undefined;
  /** The ⚑ mark, shown on any row MaxPreps publishes differently. */
  isFlagged: (row: StandingsRowData) => boolean;
  /** The automatic-qualifier cut's style under the row at `index`, or none. */
  cut: (index: number) => CSSProperties | undefined;
}

/** The row's link target: the view's `href`, else the team page. */
export function rowHref(row: StandingsRowData): string {
  return row.href ?? `/teams/${row.team.slug}`;
}

/** The form strip's accessible name for the row. */
export function rowFormLabel(row: StandingsRowData): string {
  return formStripName(row.team.name, row.standing.computed.last5.length);
}

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
 * The colour comes from the cell (rank is ink-3 in every variant). '1', 'T7' for a shared place,
 * an em dash for a team with no reported results. `whitespace-nowrap`: the phone place column is
 * 20px of content at 320 and "T7" is ~16px of 13px mono, so it must never break into a "T" over
 * a "7".
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
 * is; a static one would need `relative`.
 */
export function Abbr({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{long}</span>
    </>
  );
}

/** A number cell's text: the em dash for a team with no results or a value we do not have. */
export function dash(value: number | null, hasResults: boolean, render = (v: number) => String(v)) {
  if (!hasResults || value === null) return EM_DASH;
  return render(value);
}

/**
 * No results: a `·` on the zero rule plus an em dash, with the words for a screen reader. The home
 * page's mini table (components/home/MiniStandings.tsx) renders it in its GD cell.
 */
export function NoGoalDiff() {
  return (
    <span className="sx-num text-ink-3">
      <MissingValue words="no goal differential" glyph={`· ${EM_DASH}`} />
    </span>
  );
}
