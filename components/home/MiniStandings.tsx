import Link from 'next/link';

import { GoalDiffCell } from '../ui/GoalDiffBar';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import { EM_DASH, monthDay, ordinal } from '../../lib/format';

import type { MiniDivisionView, MiniRow } from './home-data';

/**
 * One division's top of the table inside a league panel (SPEC §10.1, DESIGN §3.1).
 *
 * How many rows, and where the labelled line falls, come from the division's own `home` config
 * (`getDivision(d).home`: SCVAL 4 rows and no line; Mt. Hamilton 4, `AQ line` after 3; Santa Teresa
 * 3, `Play-in host` after 1; PCAL 7, `AQ line` after 2; MCAL 7, `Tournament line` after 6) — never
 * from a map keyed by division id here. The line is a labelled separator ROW, so the rule is never
 * the only cue (WCAG 1.3.1).
 *
 * Columns: place, team, GP (mono 11px: the leagues' teams have played different numbers of games,
 * and points favour the ones that have played more), W-L-T, PTS (the ordering key in all four
 * leagues), GD. A team with no counted result sorts last, renders an em dash for its place and
 * its numbers — never `0-0-0`, never ranked by merit — and is still a link.
 *
 * A single-division league (PCAL, MCAL) shows NO division label: its kicker is `League table`.
 *
 * The GD plot keys off the card's width (`@container`): below a 375px card only the signed numeral
 * shows, and the sentences about bars are dropped with it.
 */
export interface MiniStandingsProps {
  division: MiniDivisionView;
  /** `/standings/<league>#<division>` */
  href: string;
  /** false for a single-division league. */
  showDivisionLabel: boolean;
  home: MiniDivisionView['home'];
  /** The league's `PTS: <citation>.` sentence; pass it under the league's LAST table only. */
  legend?: string;
  className?: string;
}

function placeText(row: MiniRow): string {
  return row.shared ? `tied for ${ordinal(row.place)}` : ordinal(row.place);
}

function rowLabel(row: MiniRow, where: string): string {
  if (!row.hasResults) return `${row.name}: no results reported yet`;
  return `${row.name}, ${placeText(row)} in ${where}, ${row.record}, ${row.pts} points`;
}

function PlaceCell({ row }: { row: MiniRow }) {
  if (!row.hasResults) {
    return (
      <span className="sx-num">
        <span aria-hidden="true">{EM_DASH}</span>
        <span className="sr-only">not ranked</span>
      </span>
    );
  }
  if (row.shared) {
    return (
      <span className="sx-num">
        <span aria-hidden="true">{row.place}=</span>
        <span className="sr-only">tied for {ordinal(row.place)}</span>
      </span>
    );
  }
  return <span className="sx-num">{row.place}</span>;
}

const COLS = 6;

/**
 * How many rows the mini table shows: `miniRows`, stretched to keep a place shared AT the cutoff
 * whole — a parent never sees a rival in "4=" and their own team, equally 4th, missing. Only
 * teams with results and the SAME shared place extend it, so an unplayed table (or the next tied
 * cluster) never stretches the card.
 */
export function miniShownCount(
  rows: readonly Pick<MiniRow, 'hasResults' | 'shared' | 'place'>[],
  miniRows: number,
): number {
  let n = Math.min(miniRows, rows.length);
  const last = rows[n - 1];
  if (!last || !last.hasResults || !last.shared) return n;
  while (n < rows.length && rows[n].hasResults && rows[n].shared && rows[n].place === last.place) n++;
  return n;
}

export function MiniStandings({ division, href, showDivisionLabel, home, legend, className }: MiniStandingsProps) {
  const shown = division.rows.slice(0, miniShownCount(division.rows, home.miniRows));
  const where = showDivisionLabel && division.heading ? division.heading : division.leagueShort;
  const through = division.throughDate;
  // The labelled line goes after PLACE `home.lineAfter`, not after a row index: two teams level on
  // 1st both sit above Santa Teresa's "Play-in host" line. No line before any result, and none
  // when every shown row is above it.
  const lineIndex =
    home.lineAfter === null
      ? -1
      : shown.reduce((at, row, i) => (row.hasResults && row.place <= (home.lineAfter as number) ? i : at), -1);
  const lineAt = lineIndex >= 0 && lineIndex < shown.length - 1 ? lineIndex : -1;
  const kicker = showDivisionLabel && division.heading ? division.heading : 'League table';
  const subject = showDivisionLabel && division.heading
    ? `${division.heading} Division league standings`
    : `${division.leagueShort} league standings`;
  return (
    <section className={className}>
      <SectionHeader
        as="h3"
        kicker={kicker}
        meta={through ? `through ${monthDay(through)}` : 'no league games yet'}
        action={{ href, label: 'Full table' }}
      />
      <div className="sx-card sx-flush sx-bleed @container">
        <table className="sx-table text-cell">
          <caption className="sr-only">
            {subject}
            {through ? ` through ${monthDay(through)}` : ', no league games played yet'} — top {shown.length} of{' '}
            {division.total}
          </caption>
          <thead className="[&_th]:static">
            <tr>
              <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
                #
              </th>
              <th scope="col">Team</th>
              <th scope="col" className="w-8 text-right">
                GP
              </th>
              <th scope="col" className="w-[52px] text-right">
                League
              </th>
              <th scope="col" className="w-11 pr-2 text-right">
                Pts
              </th>
              <th scope="col" className="w-[44px] pr-gutter text-right @min-[375px]:w-[100px]">
                GD
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <MiniRowView
                key={row.slug}
                row={row}
                where={where}
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
            <span className="hidden @min-[375px]:inline">
              {' '}
              &middot; GD bars scaled to {where} alone (|GD| max {division.gdDomain})
            </span>
          </p>
          {legend ? (
            <details className="sx-disclosure mt-3">
              <summary>How to read {showDivisionLabel ? 'these tables' : 'this table'}</summary>
              <p className="m-0 max-w-prose text-meta text-ink-2">
                {legend} GP is league games with a counted result.{' '}
                {showDivisionLabel
                  ? 'GD bars are scaled per division, so two divisions’ bars are not comparable.'
                  : 'GD bars are scaled to this table alone.'}
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
  where,
  gdDomain,
  line,
}: {
  row: MiniRow;
  where: string;
  gdDomain: number;
  line: string | null;
}) {
  const has = row.hasResults;
  return (
    <>
      <tr data-team-slug={row.slug} className="relative" style={{ height: 52 }}>
        <td className="w-[2.75rem] pl-gutter pr-2 text-ink-3">
          <PlaceCell row={row} />
        </td>
        <th scope="row" className="max-w-0 text-left font-normal">
          {/* The stretched row link (prefetch off: a static team route is downloaded in full on
              viewport entry otherwise). Only the pinned row's sr-only note is displayed. */}
          <Link href={`/teams/${row.slug}`} prefetch={false} className="absolute inset-0">
            <span className="sr-only">
              <span className="sx-pin-note">Your team. </span>
              {rowLabel(row, where)}
            </span>
          </Link>
          <span className="flex items-center gap-2">
            <TeamMonogram team={{ abbr: row.abbr, name: row.name, colors: row.colors }} size={24} />
            <span className="min-w-0 truncate text-body text-ink">{row.shortName}</span>
          </span>
        </th>
        <td className="sx-num w-8 text-right text-[11px] text-ink-2">{has ? row.gp : EM_DASH}</td>
        <td className="sx-num w-[52px] text-right font-medium text-ink">{has ? row.record : EM_DASH}</td>
        <td className="sx-num w-11 pr-2 text-right text-body font-bold text-ink">{has ? row.pts : EM_DASH}</td>
        <td className="w-[44px] pr-gutter text-right @min-[375px]:w-[100px]">
          {has ? (
            <GoalDiffCell
              value={row.gd}
              domain={gdDomain}
              track={56}
              numberWidth={24}
              numberClassName="text-cell"
              barClassName="hidden @min-[375px]:block"
            />
          ) : (
            <span className="sx-num text-ink-3">
              <span aria-hidden="true">&middot; {EM_DASH}</span>
              <span className="sr-only">no goal differential</span>
            </span>
          )}
        </td>
      </tr>
      {line ? (
        <tr>
          <td colSpan={COLS} className="border-t-2 border-rule py-1 pl-gutter text-micro text-ink-3">
            {line}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default MiniStandings;
