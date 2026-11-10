import FormStrip, { toFormEntries } from '../../ui/FormStrip';
import { GoalDiffCell } from '../../ui/GoalDiffBar';
import { StretchedRowLink } from '../../ui/PinNote';
import TeamMonogram from '../../ui/TeamMonogram';
import { EM_DASH, recordString, streakString, winPct } from '../../../lib/format';

import {
  Abbr,
  FlagMark,
  LeagueRecord,
  PlaceCell,
  dash,
  gpText,
  gpTitle,
  isFlagged,
  rowLabel,
  tableName,
  tableRows,
} from './cells';
import type { StandingsTableProps } from './types';

/*
 * The desktop table's column widths, lg tier then xl (brief §4.14). `.sx-table-wide` is
 * `table-layout: fixed`, so these are the ONLY widths the browser uses: each one includes the
 * cell's own padding (6px a side at lg, 10px from 1280, and 20px at the card's two inner edges),
 * and Team takes whatever is left — about 170px of the 976px table at 1024, 200px at 1280.
 * Every head fits its column at 12px sans caps: "LEAGUE" ≈ 46px and "OVERALL" ≈ 55px are why
 * those two columns are wider than their numerals need.
 */
const COL = {
  place: 'w-[3rem] xl:w-[3.5rem]', // #
  team: '', // Team (auto)
  gp: 'w-[3.25rem] xl:w-[3.75rem]', // GP: "12/16" is five 13px mono glyphs
  pts: 'w-[3rem] xl:w-[3.5rem]', // PTS
  left: 'w-[3rem] xl:w-[3.5rem]', // LEFT
  max: 'w-[3rem] xl:w-[3.5rem]', // MAX
  league: 'w-[3.75rem] xl:w-[4.5rem]', // League (a † hangs in the right padding: LeagueRecord)
  pct: 'w-[3.25rem] xl:w-[4rem]', // Pct
  overall: 'w-[4.25rem] xl:w-[5rem]', // Overall
  gf: 'w-[2.5rem] xl:w-[3rem]', // GF
  ga: 'w-[2.5rem] xl:w-[3rem]', // GA
  gd: 'w-[6.75rem] xl:w-[7.5rem]', // GD: 64 track + 4 + 28 numeral
  stk: 'w-[2.75rem] xl:w-[3.25rem]', // Stk
  home: 'w-[3.25rem] xl:w-[4rem]', // Home
  away: 'w-[3.25rem] xl:w-[4rem]', // Away
  neut: 'w-[3.25rem] xl:w-[4rem]', // Neut
  l5: 'w-[8.875rem] xl:w-[9.25rem]', // Last 5: five 20px chips, 4px apart, right-aligned
} as const;
type DesktopCol = keyof typeof COL;

/**
 * The desktop columns in order. With GP / LEFT / MAX on, the Home / Away / Neutral splits go (the
 * team page has them): three 3rem columns in, three 3.25rem out, so Team keeps ≈170px at 1024.
 */
function desktopCols(gp: boolean, left: boolean, max: boolean): DesktopCol[] {
  const extended = gp || left || max;
  return [
    'place',
    'team',
    ...(gp ? (['gp'] as const) : []),
    'pts',
    ...(left ? (['left'] as const) : []),
    ...(max ? (['max'] as const) : []),
    'league',
    'pct',
    'overall',
    'gf',
    'ga',
    'gd',
    'stk',
    ...(extended ? [] : (['home', 'away', 'neut'] as const)),
    'l5',
  ];
}

/**
 * Each desktop head: `long` (when set) is what a screen reader hears with every cell of the column
 * (`Abbr`). GP, Left and Max carry a `title` instead and stay plain words. The team head is the
 * table's own name (`tableName`), filled in per render: see the phone head.
 */
const DESKTOP_HEAD: Record<DesktopCol, { label: string; right: boolean; title?: string; long?: string }> = {
  place: { label: '#', right: false },
  team: { label: 'Team', right: false },
  gp: { label: 'GP', right: true, title: 'League games counted of those scheduled' },
  pts: { label: 'Pts', right: true, long: 'Points' },
  left: { label: 'Left', right: true, title: 'League games with no counted result yet' },
  max: { label: 'Max', right: true, title: 'The most points a team can finish with' },
  league: { label: 'League', right: true },
  pct: { label: 'Pct', right: true, long: 'Win percentage' },
  overall: { label: 'Overall', right: true },
  gf: { label: 'GF', right: true, long: 'Goals for' },
  ga: { label: 'GA', right: true, long: 'Goals against' },
  gd: { label: 'GD', right: true, long: 'Goal difference' },
  stk: { label: 'Stk', right: true, long: 'Streak' },
  home: { label: 'Home', right: true },
  away: { label: 'Away', right: true },
  neut: { label: 'Neut', right: true, long: 'Neutral site' },
  // Right-aligned, head and strip: a team with fewer than five results then ends on its NEWEST
  // chip at the same x as every other row.
  l5: { label: 'Last 5', right: true },
};

/**
 * The desktop face of the league table (from `lg`): one wide row per team under a fixed column
 * plan (`COL`). StandingsTable renders it inside the card.
 */
export function DesktopStandingsTable(props: StandingsTableProps) {
  const { gdDomain } = props;
  const { flagged, columns, ctx, fixedSchedule, cut, hrefOf, formLabel } = tableRows(props);
  const showGp = columns.has('gp');
  const cols = desktopCols(showGp, columns.has('left'), columns.has('max'));
  const rows = props.rows;
  return (
    <>
      <colgroup>
        {cols.map((col) => (
          <col key={col} className={COL[col] || undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {cols.map((col) => {
            const head = DESKTOP_HEAD[col];
            if (col === 'team') {
              // The table's name, not "Team" (see the phone head above).
              return (
                <th key={col} scope="col">
                  {tableName(props.division)}
                  <span className="sr-only"> team</span>
                </th>
              );
            }
            return (
              <th
                key={col}
                scope="col"
                title={col === 'gp' ? gpTitle(fixedSchedule) : head.title}
                className={head.right ? 'text-right' : undefined}
              >
                {head.long ? <Abbr short={head.label} long={head.long} /> : head.label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const s = row.standing;
          const has = s.hasReportedResults;
          const c = ctx(row);
          const cell = (col: DesktopCol): React.ReactNode => {
            switch (col) {
              case 'gp':
                return <td key={col} className="sx-num text-right text-ink-2">{gpText(c)}</td>;
              case 'pts':
                return (
                  <td key={col} className="sx-num text-right text-body font-bold text-ink">
                    {s.computed.pts}
                  </td>
                );
              case 'left':
                return <td key={col} className="sx-num text-right text-ink-2">{c?.remaining ?? EM_DASH}</td>;
              case 'max':
                return <td key={col} className="sx-num text-right text-ink-2">{c?.maxPts ?? EM_DASH}</td>;
              case 'league':
                return (
                  <td key={col} className="sx-num text-right font-medium text-ink">
                    <LeagueRecord record={recordString(s.computed)} context={c} />
                  </td>
                );
              case 'pct':
                return (
                  <td key={col} className="sx-num text-right font-medium text-ink">
                    {winPct(s.computed.winPct)}
                  </td>
                );
              case 'overall':
                return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.overall)}</td>;
              case 'gf':
                return <td key={col} className="sx-num text-right text-ink-2">{dash(s.computed.gf, has)}</td>;
              case 'ga':
                return <td key={col} className="sx-num text-right text-ink-2">{dash(s.computed.ga, has)}</td>;
              case 'gd':
                return (
                  <td key={col} className="text-right">
                    <GoalDiffCell
                      value={s.computed.gd}
                      domain={gdDomain}
                      track={64}
                      thickness={8}
                      numberWidth={28}
                    />
                  </td>
                );
              case 'stk':
                return (
                  <td key={col} className="sx-num text-right text-ink-2">
                    {streakString(s.computed.streak)}
                  </td>
                );
              case 'home':
                return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.homeRecord)}</td>;
              case 'away':
                return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.awayRecord)}</td>;
              case 'neut':
                return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.neutralRecord)}</td>;
              case 'l5':
                return (
                  <td key={col} className="text-right">
                    <FormStrip
                      entries={toFormEntries(s.computed.last5)}
                      size={20}
                      label={formLabel(row)}
                    />
                  </td>
                );
              default:
                return null;
            }
          };
          return (
            <tr
              key={row.team.id}
              data-team-slug={row.team.slug}
              className="relative"
              // rem, not px: the row grows with the browser text size.
              style={{ height: 'var(--spacing-row-1)', ...cut(index) }}
            >
              <td className="text-ink-3">
                <PlaceCell standing={s} />
              </td>
              {/* `aria-label`: the row header is re-announced on every cell, and without
                  it carries the row link's whole sentence (see the phone variant). */}
              <th scope="row" aria-label={row.team.name} className="text-left font-normal">
                <StretchedRowLink href={hrefOf(row)} label={rowLabel(row)} />
                <span className="flex items-center gap-3">
                  <TeamMonogram team={row.team} size={24} />
                  <span className="min-w-0 truncate text-body font-medium text-ink">
                    {row.team.shortName}
                  </span>
                  {isFlagged(row, flagged) ? <FlagMark name={row.team.name} /> : null}
                </span>
              </th>
              {has ? (
                cols.slice(2).map(cell)
              ) : (
                /* A team with no reported results gets ONE sentence across the data
                   columns: no fabricated 0-0-0, no row of em dashes. The place cell and
                   the row link already say "not ranked" / "no results reported yet" to a
                   screen reader. GP still reads 0/12 where the column is on: a fact, not
                   a rank. */
                <>
                  {showGp ? cell('gp') : null}
                  <td colSpan={cols.length - (showGp ? 3 : 2)} className="text-ink-3">
                    No results reported yet
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </>
  );
}
