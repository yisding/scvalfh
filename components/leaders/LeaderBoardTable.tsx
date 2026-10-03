import Link from 'next/link';

import { ordinal } from '../../lib/format';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import type { LeaderBoard, LeaderCell, LeaderRow } from './leaders-view';

/**
 * One /leaders board (DESIGN §16): an h3, a ranked table, and the line that says what it counts.
 *
 * A real `<table>`: a leaderboard is tabular data a reader scans down a column. The layout is
 * fixed from a `<colgroup>`, as on /history, so the numbers line up from board to board, and every
 * board keeps to at most three numeric columns so a 320px phone needs no scroller (DESIGN §10.8).
 * The column the board is ranked on is the bold one.
 *
 * The place cell follows the standings tables: `1`, `T7` for a shared place (with "tied for 7th"
 * for a screen reader), never colour alone. Every row carries `data-team-slug`, so the pinned-team
 * script and `PinnedTeamMarks` draw the 2px accent rule on the pinned team's rows (on a player
 * board, all of that team's players) with the visually hidden "Your team" note beside it.
 *
 * Below 640px a name cell shows the team's short name (the phone cell is about 100-125px wide, so
 * "St. Ignatius College Preparatory" would take four lines), and the full name from there. The row
 * header has no `aria-label`: its content is what is read, so the pinned row's note is too.
 */

/** Column widths, by the widest value each column holds in 13px mono plus its gutter. */
const WIDTH: Readonly<Record<string, string>> = {
  record: 'w-16', // "12-1-3"
  pct: 'w-[3.25rem] sm:w-[3.75rem]', // "1.000", after the wider gutter below
  savePct: 'w-14', // "85.9%"
  perGame: 'w-12', // "7.17"
};
/** The last column also carries the card's 16px inner edge. */
const LAST_WIDTH: Readonly<Record<string, string>> = {
  record: 'w-20',
  pct: 'w-16',
  savePct: 'w-[4.5rem]',
  perGame: 'w-16',
};
/**
 * The gutter before a column: 8px, except before Pct, which follows the record. Both are
 * dash-separated mono numbers, and at 8px "10-0-0 1.000" read as one string.
 */
const GUTTER: Readonly<Record<string, string>> = {
  pct: 'pl-3 sm:pl-5',
};

function Dash() {
  return (
    <>
      <span aria-hidden="true">&mdash;</span>
      <span className="sr-only">not recorded</span>
    </>
  );
}

function Cell({ cell }: { cell: LeaderCell }) {
  if (cell.text === null) return <Dash />;
  if (!cell.sr) return <>{cell.text}</>;
  return (
    <>
      <span aria-hidden="true">{cell.text}</span>
      <span className="sr-only">{cell.sr}</span>
    </>
  );
}

function Place({ row }: { row: LeaderRow }) {
  if (!row.tied) return <span className="sx-num">{row.rank}</span>;
  return (
    <span className="sx-num whitespace-nowrap">
      <span aria-hidden="true">T{row.rank}</span>
      <span className="sr-only">tied for {ordinal(row.rank)}</span>
    </span>
  );
}

/** Short name below 640px, the full name from there. */
function TeamName({ name, shortName }: { name: string; shortName: string }) {
  if (name === shortName) return <>{name}</>;
  return (
    <>
      <span className="sm:hidden">{shortName}</span>
      <span className="hidden sm:inline">{name}</span>
    </>
  );
}

function NameCell({ board, row }: { board: LeaderBoard; row: LeaderRow }) {
  const { team } = row;
  // `prefetch={false}` for the reason every team link on the site carries it (NavLink.tsx,
  // StandingsTable.tsx): the routes are static, and `auto` would download every linked team page
  // the moment a board scrolled into view.
  if (board.kind === 'player') {
    return (
      <>
        <span className="block text-body text-ink">{row.name}</span>
        <span className="block text-meta text-ink-3">
          <Link href={team.href} prefetch={false} className="text-ink-2 no-underline hover:underline">
            <TeamName name={team.name} shortName={team.shortName} />
          </Link>{' '}
          <span aria-hidden="true">&middot;</span> {team.league}
        </span>
      </>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {/* The monogram waits for 640px: below it the cell is too narrow to spare 32px. */}
      <span className="hidden shrink-0 sm:inline-flex">
        <TeamMonogram team={team.team} size={24} />
      </span>
      <span className="min-w-0">
        <Link href={team.href} prefetch={false} className="block text-body text-ink no-underline hover:underline">
          <TeamName name={team.name} shortName={team.shortName} />
        </Link>
        <span className="block text-meta text-ink-3">{team.league}</span>
      </span>
    </span>
  );
}

export function LeaderBoardTable({ board }: { board: LeaderBoard }) {
  const last = board.columns.length - 1;
  return (
    <section id={board.id} className="min-w-0 scroll-mt-24">
      <SectionHeader as="h3" kicker={board.title} meta={board.meta} />
      {board.rows.length === 0 ? (
        <p className="sx-card m-0 p-4 text-meta text-ink-2">{board.empty}</p>
      ) : (
        <div className="sx-card sx-flush sx-bleed">
          <table className="sx-table table-fixed text-meta">
            <caption className="sr-only">{board.caption}</caption>
            <colgroup>
              {/* 48px: 16 of left padding, "T10" in 13px mono, 8 of gutter. */}
              <col className="w-12" />
              <col />
              {board.columns.map((c, i) => (
                <col
                  key={c.key}
                  className={i === last ? (LAST_WIDTH[c.key] ?? 'w-[3.75rem]') : (WIDTH[c.key] ?? 'w-11')}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="pl-4 pr-2">
                  <span aria-hidden="true">#</span>
                  <span className="sr-only">Place</span>
                </th>
                <th scope="col">{board.kind === 'player' ? 'Player' : 'Team'}</th>
                {board.columns.map((c, i) => (
                  <th key={c.key} scope="col" className={`${GUTTER[c.key] ?? 'pl-2'} text-right ${i === last ? 'pr-4' : ''}`}>
                    <span aria-hidden="true">{c.label}</span>
                    <span className="sr-only">{c.title}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr key={row.key} data-team-slug={row.team.slug} className="h-14">
                  <td className="pl-4 pr-2 text-cell text-ink-3">
                    <Place row={row} />
                  </td>
                  <th scope="row" className="py-2 text-left font-normal">
                    {/* Only the pinned team's rows display this (app/globals.css), so the accent
                        rule is never the only thing saying "your team". */}
                    <span className="sr-only">
                      <span className="sx-pin-note">
                        {board.kind === 'player' ? 'Your team’s player. ' : 'Your team. '}
                      </span>
                    </span>
                    <NameCell board={board} row={row} />
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={board.columns[i].key}
                      className={`sx-num ${GUTTER[board.columns[i].key] ?? 'pl-2'} text-right text-cell ${
                        i === board.rankedBy ? 'font-semibold text-ink' : 'text-ink-2'
                      } ${i === last ? 'pr-4' : ''}`}
                    >
                      <Cell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {board.more ? <p className="mt-2 mb-0 text-meta text-ink-2">{board.more}</p> : null}
      <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">{board.note}</p>
    </section>
  );
}

export default LeaderBoardTable;
