import Link from 'next/link';

import MissingValue from '../ui/MissingValue';
import { PinNote } from '../ui/PinNote';
import PlaceMark from '../ui/PlaceMark';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import type { LeaderBoard, LeaderCell, LeaderColumnKey, LeaderRow } from './types';

/**
 * One /leaders board (DESIGN §16, §33): a group strip with the board's title over a ranked table of
 * its top five, then a closed "Show all" with every row after the fifth, so the board reads as a
 * top five and opens with zero JavaScript. Every player or school tied for a board's last place is
 * listed, however many: they are all in the DOM, five above the disclosure and the rest inside it,
 * in a second table whose columns line up with the first (a fixed layout from one `<colgroup>`).
 *
 * A real `<table>` (`.sx-table.sx-leadtable`): the place, the school's logo, the name over one small
 * line (a player's school, with the grade and position the team page's roster prints on a line
 * below it; a school's league), then every column the board carries, each under its
 * head ("G A Pts", "W-L-T Pct GD"). The column the board is ranked on is the bold one
 * (`.sx-col-key`). The leader is not drawn larger than the rows under it.
 *
 * The place follows the standings tables: `1`, `T7` for a shared place (with "tied for 7th" for a
 * screen reader), never colour alone. Every row carries `data-team-slug`, so the pinned-team script
 * and `PinnedTeamMarks` mark the reader's team's rows (on a player board, all of that team's
 * players); the hidden "Your team" note leads the row link's name.
 *
 * The row is one link: the name's `::after` stretches over the `relative` row (`.sx-rowlink`) and
 * carries the focus ring. A player's row goes to the player's own row on the team page's roster
 * (`#player-jane-doe`, or the team's player stats where no roster row joins), a school's to its page.
 * The names are the short ones at every width, so a name never wraps.
 */

/**
 * A column's width, by the widest value it holds plus its gutter; a key left out takes the default
 * (`w-10`, 2.5rem: "128", "Pts"); Tailwind classes written out whole, so the build sees them. Keyed by LeaderColumnKey, so a renamed column cannot silently fall back.
 */
const WIDTH: Readonly<Partial<Record<LeaderColumnKey, string>>> = {
  record: 'w-[4rem]', // "12-1-3"
  pct: 'w-[3.25rem]', // "1.000"
  gd: 'w-[2.75rem]', // "+38"
  perGame: 'w-[3rem]', // "17.2"
  adjusted: 'w-[3.25rem]', // "17.76"
  factor: 'w-[3rem]', // "1.08"
  adjustedPoints: 'w-[3.5rem]', // "228.5"
  savePct: 'w-[3.5rem]', // "85.9%"
  elo: 'w-[3.25rem]', // "1612"
  threePointPct: 'w-[3.25rem]', // "41.7"
  hittingPct: 'w-[3.5rem]', // ".312"
};
const DEFAULT_WIDTH = 'w-10';

function Cell({ cell }: { cell: LeaderCell }) {
  if (cell.text === null) return <MissingValue words="not recorded" />;
  if (!cell.sr) return <>{cell.text}</>;
  return (
    <>
      <span aria-hidden="true">{cell.text}</span>
      <span className="sr-only">{cell.sr}</span>
    </>
  );
}

/** How many rows a board shows before "Show all". */
export const BOARD_TOP = 5;

function Row({ board, row }: { board: LeaderBoard; row: LeaderRow }) {
  const { team } = row;
  const player = board.kind === 'player';
  return (
    <tr className="relative" data-team-slug={team.slug}>
      <td className="sx-num sx-col-rank">
        <PlaceMark place={row.rank} shared={row.tied} />
      </td>
      <th scope="row" className="sx-col-team">
        <span className="sx-teamcell">
          <TeamMonogram team={team} size={24} />
          <span className="min-w-0">
            {/* `prefetch={false}` for the reason every team link on the site carries it (NavLink.tsx,
                PinNote.tsx): the routes are static, and `auto` would download every linked team page
                the moment a board scrolled into view. */}
            <Link href={team.href} prefetch={false} className="sx-leader-name sx-rowlink">
              {/* Only the pinned team's rows display this (app/globals.css). */}
              <span className="sr-only">
                <PinNote text={player ? 'Your team’s player. ' : 'Your team. '} />
              </span>
              {player ? row.name : team.shortName}
            </Link>
            {player ? (
              <>
                <small>{team.shortName}</small>
                {/* The grade and position the team page's roster prints ("Junior · Midfield"), only
                    the ones it has, on a line of their own: a board is about 350px wide at every
                    width, so after the school they would end in an ellipsis on most rows. */}
                {row.facts.length > 0 ? (
                  <small>
                    {row.facts.map((fact, i) => (
                      <span key={fact}>
                        {i > 0 ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="sr-only">, </span>
                          </>
                        ) : null}
                        {fact}
                      </span>
                    ))}
                  </small>
                ) : null}
              </>
            ) : (
              <small>{team.leagueShort}</small>
            )}
          </span>
        </span>
      </th>
      {row.cells.map((cell, i) => (
        <td key={board.columns[i].key} className={i === board.rankedBy ? 'sx-num sx-col-key' : 'sx-num sx-col-quiet'}>
          <Cell cell={cell} />
        </td>
      ))}
    </tr>
  );
}

/** The board's table: its top five, or the rows behind "Show all" (`continued`: head for a screen reader only). */
function BoardTable({ board, rows, caption, continued = false }: { board: LeaderBoard; rows: readonly LeaderRow[]; caption: string; continued?: boolean }) {
  return (
    <table className="sx-table sx-leadtable">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col className="w-8" />
        <col />
        {board.columns.map((c) => (
          <col key={c.key} className={WIDTH[c.key] ?? DEFAULT_WIDTH} />
        ))}
      </colgroup>
      <thead className={continued ? 'sx-leadtable-head-sr' : undefined}>
        <tr>
          <th scope="col" className="sx-col-rank">
            <span aria-hidden="true">#</span>
            <span className="sr-only">Place</span>
          </th>
          <th scope="col" className="sx-col-team">
            {board.kind === 'player' ? 'Player' : 'Team'}
          </th>
          {board.columns.map((c, i) => (
            <th key={c.key} scope="col" className={i === board.rankedBy ? 'sx-col-key' : undefined}>
              <span aria-hidden="true">{c.label}</span>
              <span className="sr-only">{c.title}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Row key={row.key} board={board} row={row} />
        ))}
      </tbody>
    </table>
  );
}

export interface LeaderBoardTableProps {
  board: LeaderBoard;
}

export function LeaderBoardTable({ board }: LeaderBoardTableProps) {
  const rows = [...board.rows, ...(board.extra?.rows ?? [])];
  const rest = rows.slice(BOARD_TOP);
  return (
    <section id={board.id} className="sx-board min-w-0">
      {/* The qualifier is the board's rule ("At least 9 games"), said in the strip's end slot. */}
      <SectionHeader strip kicker={board.title} meta={/^At least /.test(board.meta) ? board.meta : undefined} />
      {rows.length === 0 ? (
        // No row listed: nobody qualifies yet.
        <p className="sx-empty">{board.empty}</p>
      ) : (
        <BoardTable board={board} rows={rows.slice(0, BOARD_TOP)} caption={board.caption} />
      )}
      {rest.length > 0 ? (
        <details className="sx-disclosure">
          <summary>
            <span data-when="closed">Show all</span>
            <span data-when="open">Show fewer</span>
          </summary>
          <BoardTable board={board} rows={rest} caption={`${board.caption}, continued`} continued />
        </details>
      ) : null}
    </section>
  );
}

export default LeaderBoardTable;
