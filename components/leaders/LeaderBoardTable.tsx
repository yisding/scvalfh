import Link from 'next/link';

import MissingValue from '../ui/MissingValue';
import { PinNote } from '../ui/PinNote';
import PlaceMark from '../ui/PlaceMark';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import type { LeaderBoard, LeaderCell, LeaderRow } from './types';

/**
 * One /leaders board (DESIGN §16, §33): a group strip with the board's title over a ranked list of
 * its top five, then a closed "Show all" with every row after the fifth, so the board reads as a
 * top five and opens with zero JavaScript. Every player or school tied for a board's last place is
 * listed, however many: they are all in the DOM, five above the disclosure and the rest inside it,
 * in one continuous numbering (`<ol start={6}>`).
 *
 * A row (`.sx-leader`): the place, the school's logo, the name over one small line (a player's
 * school; a school's league), and ONE figure: the number the board is ranked on. No column heads
 * and no second number: the strip says what the figure is. The leader's figure is one step larger
 * (CSS). A list, not a table: one figure per row needs no columns.
 *
 * The place follows the standings tables: `1`, `T7` for a shared place (with "tied for 7th" for a
 * screen reader), never colour alone. Every row carries `data-team-slug`, so the pinned-team script
 * and `PinnedTeamMarks` mark the reader's team's rows (on a player board, all of that team's
 * players); the hidden "Your team" note leads the row link's name.
 *
 * The row is one link: the name's `::after` stretches over the `relative` row (`.sx-rowlink`) and
 * carries the focus ring. A player's row goes to the team's player stats, a school's to its page.
 * The names are the short ones at every width, so a row never needs two lines.
 */

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
  const recordAt = player ? -1 : board.columns.findIndex((column) => column.key === 'record');
  const record = recordAt >= 0 && recordAt !== board.rankedBy ? row.cells[recordAt] : null;
  return (
    <li className="sx-leader" data-team-slug={team.slug}>
      <span className="sx-num">
        <PlaceMark place={row.rank} shared={row.tied} />
      </span>
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
        <small>
          {player ? team.shortName : team.leagueShort}
          {/* A board ranked on a rate says the record behind it: ".810" alone hides 17-4-0. */}
          {record ? <span className="sx-num ml-2">{record.sr ? <><span aria-hidden="true">{record.text}</span><span className="sr-only">{record.sr}</span></> : record.text}</span> : null}
        </small>
      </span>
      <span className="sx-num">
        <Cell cell={row.cells[board.rankedBy]} />
      </span>
    </li>
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
        <ol aria-label={board.caption}>
          {rows.slice(0, BOARD_TOP).map((row) => (
            <Row key={row.key} board={board} row={row} />
          ))}
        </ol>
      )}
      {rest.length > 0 ? (
        <details className="sx-disclosure">
          <summary>
            <span data-when="closed">Show all</span>
            <span data-when="open">Show fewer</span>
          </summary>
          <ol start={BOARD_TOP + 1} aria-label={`${board.caption}, continued`}>
            {rest.map((row) => (
              <Row key={row.key} board={board} row={row} />
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

export default LeaderBoardTable;
