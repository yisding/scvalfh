import { NoGoalDiff } from '@/components/standings/table/cells';
import { LadderLineRow, TeamNameCell, TeamRowLink } from '@/components/standings/table/parts';
import { GoalDiffCell } from '@/components/ui/GoalDiffBar';
import PlaceMark from '@/components/ui/PlaceMark';
import SectionHeader from '@/components/ui/SectionHeader';
import { monthDay } from '@/lib/format/dates';
import { EM_DASH } from '@/lib/format/words';
import { teamHref } from '@/lib/shared/routes';
import type { MiniDivisionView, MiniRow } from '@/views/home/mini-standings';
import { ladderLineAfter } from '@/views/standings/division';
import { biggestGoalDiff } from '@/views/standings/goal-diff';

/**
 * One division's top of the table inside a league panel (SPEC §10.1, DESIGN §3.1).
 *
 * How many rows, and where the labelled line falls, come from the division's own `home` config
 * (`getDivision(d).home`: SCVAL 4 rows and no line; Mt. Hamilton 4, `AQ line` after 3; Santa Teresa
 * 3, `Play-in host` after 1; PCAL 7, `AQ line` after 2; MCAL 7, `Tournament line` after 6; EAL 6
 * and no line, `lineAfter` null: its Super Regional takes the top six of six) — never
 * from a map keyed by division id here. The line is a labelled separator ROW, so the rule is never
 * the only cue (WCAG 1.3.1).
 *
 * Columns: place, team, GP (mono 11px: the leagues' teams have played different numbers of games,
 * and points favour the ones that have played more), W-L-T, PTS (the ordering key in all five
 * leagues), GD. A team with no counted result sorts last, renders an em dash for its place and
 * its numbers — never `0-0-0`, never ranked by merit — and is still a link.
 *
 * A single-division league (PCAL, MCAL, EAL) shows NO division label: its kicker is `League table`.
 * The kicker, the caption's subject (the full table's words, review 2026-10-06) and how many rows
 * show (`miniShownCount`: a place shared at the cutoff stays whole) come from the view,
 * views/home/mini-standings.ts.
 *
 * The GD plot keys off the card's width (`@container`): below a 23.4375rem card (375px at the
 * default text size, wider under a larger one) only the signed numeral shows, and the sentences
 * about bars are dropped with it — the SAME query, in the same unit, so every sentence about the
 * bars stays in step with whether any bars are drawn. The bar scale is said in words ("bars scaled
 * to De Anza's biggest goal difference (36)"), not as "|GD| max 36".
 *
 * The name keeps its room under a large browser text size, by the same rem container queries:
 * below a 20rem card (320px at the default text size, so never on a phone at 16px; 400 at 20px,
 * 480 at 24px) the GP column drops out, and below 18rem (360 at 20px, 432 at 24px) the monogram
 * does too — at 320 with 24px text the two left the name 17px, one letter per row. The name
 * itself wraps onto two lines at a space, never per letter; a word still too long ends in "…".
 *
 * A shared place reads `T4` (sr-only "tied for 4th"), the site-wide tie mark.
 *
 */
export interface MiniStandingsProps {
  /** The division's rows, its `href` (`/standings/<league>#<division>`), its `home` config and its heading (null for a single-division league). */
  division: MiniDivisionView;
  /** The league's `PTS: <citation>.` sentence; pass it under the league's LAST table only. */
  legend?: string;
  className?: string;
}

const COLS = 6;

export function MiniStandings({ division, legend, className }: MiniStandingsProps) {
  const { href, home } = division;
  // A single-division league (no heading) shows no division label.
  const showDivisionLabel = division.heading !== null;
  const shown = division.rows.slice(0, division.shown);
  const where = showDivisionLabel && division.heading ? division.heading : division.leagueShort;
  const through = division.throughDate;
  // The labelled line goes after PLACE `home.lineAfter`, counted over the shown rows
  // (ladderLineAfter): no line before any result, and none when every shown row is above it.
  const lineAfter = ladderLineAfter(
    shown.map((row) => ({ ranked: row.hasResults, place: row.place })),
    home.lineAfter,
  );
  const lineAt = lineAfter === null ? -1 : lineAfter - 1;
  return (
    <section className={className}>
      <SectionHeader
        as="h3"
        kicker={division.kicker}
        meta={through ? `through ${monthDay(through)}` : 'no league games yet'}
        action={{ href, label: 'Full table' }}
      />
      <div className="sx-card sx-flush sx-bleed @container">
        <table className="sx-table text-cell">
          <caption className="sr-only">
            {division.captionSubject}
            {through ? ` through ${monthDay(through)}` : ', no league games played yet'} — top {shown.length} of{' '}
            {division.total}
          </caption>
          <thead className="[&_th]:static">
            <tr>
              <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
                #
              </th>
              <th scope="col">Team</th>
              <th scope="col" className="w-8 text-right @max-[20rem]:hidden">
                GP
              </th>
              <th scope="col" className="w-[52px] text-right">
                League
              </th>
              <th scope="col" className="w-11 pr-2 text-right">
                Pts
              </th>
              <th scope="col" className="w-[44px] pr-gutter text-right @min-[23.4375rem]:w-[100px]">
                GD
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <MiniRowView
                key={row.slug}
                row={row}
                gdDomain={division.gdDomain}
                line={index === lineAt ? home.lineLabel : null}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="sx-bleed @container">
        <div className="px-gutter md:px-0">
          <p className="mt-2 mb-0 text-meta text-ink-3">
            Top {shown.length} of {division.total}
            {/* Only when some team has a goal difference: gdDomain's floor of 1 is a scale, not a fact. */}
            {biggestGoalDiff(division.rows.map((r) => r.gd)) > 0 ? (
              <span className="hidden @min-[23.4375rem]:inline">
                {' '}
                &middot; bars scaled to {where}&rsquo;s biggest goal difference ({division.gdDomain})
              </span>
            ) : null}
          </p>
          {legend ? (
            <details className="sx-disclosure mt-3">
              <summary>How to read {showDivisionLabel ? 'these tables' : 'this table'}</summary>
              <p className="m-0 max-w-prose text-meta text-ink-2">
                {legend} GP is league games with a counted result.
                {/* Under the same container query as the bars: below it no bar is drawn, so no
                    sentence about bars is printed either. */}
                <span className="hidden @min-[23.4375rem]:inline">
                  {' '}
                  {showDivisionLabel
                    ? 'GD bars are scaled per division, so two divisions’ bars are not comparable.'
                    : 'GD bars are scaled to this table alone.'}
                </span>
              </p>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MiniRowView({
  row,
  gdDomain,
  line,
}: {
  row: MiniRow;
  gdDomain: number;
  line: string | null;
}) {
  const has = row.hasResults;
  return (
    <>
      <tr data-team-slug={row.slug} className="relative" style={{ height: 'var(--spacing-row-1)' }}>
        <td className="w-[2.75rem] pl-gutter pr-2 text-ink-3">
          <PlaceMark place={row.place} shared={row.shared} ranked={row.hasResults} className="sx-num" />
        </td>
        <th scope="row" className="max-w-0 text-left font-normal">
          {/* The stretched row link (prefetch off: a static team route is downloaded in full on
              viewport entry otherwise). Only the pinned row's sr-only note is displayed. Its
              sentence is the standings tables' (views/standings/table-notes.ts), built in the view. */}
          <TeamRowLink href={teamHref(row.slug)} label={row.label} />
          <span className="flex items-center gap-2">
            {/* Up to two lines, broken between words only: a name never loses its second word
                to an ellipsis and never breaks per letter; a single word too long for the cell
                ends in an ellipsis. */}
            <TeamNameCell
              team={row}
              size={24}
              monogramClass="@max-[18rem]:hidden"
              nameClass="min-w-0 line-clamp-2 text-ellipsis text-body text-ink"
            />
          </span>
        </th>
        <td className="sx-num w-8 text-right text-[11px] text-ink-2 @max-[20rem]:hidden">{has ? row.gp : EM_DASH}</td>
        <td className="sx-num w-[52px] text-right font-medium text-ink">{has ? row.record : EM_DASH}</td>
        <td className="sx-num w-11 pr-2 text-right text-body font-bold text-ink">{has ? row.pts : EM_DASH}</td>
        <td className="w-[44px] pr-gutter text-right @min-[23.4375rem]:w-[100px]">
          {has ? (
            <GoalDiffCell
              value={row.gd}
              domain={gdDomain}
              track={56}
              numberWidth={24}
              numberClassName="text-cell"
              barClassName="hidden @min-[23.4375rem]:block"
            />
          ) : (
            <NoGoalDiff />
          )}
        </td>
      </tr>
      {line ? <LadderLineRow colSpan={COLS} label={line} /> : null}
    </>
  );
}

export default MiniStandings;
