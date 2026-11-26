import Link from 'next/link';

import type { PoolTableModel } from './festival-model';

/**
 * A pool's table (DESIGN §35 §6), in the markup of the site's compact standings table (`.sx-tablewrap` /
 * `.sx-table`; components/standings/CompactStandingsTable.tsx): rows in TourneyMachine's order, its rank (points,
 * then wins, goal difference, goals for: regs D.2) except that teams level on all four are listed alphabetically
 * until the event staff fill the placement sides; the feed has no head-to-head or shoot-out result to break them. So
 * such rows share one rank, printed '=1' ("tied 1" to a screen reader), and none of them is called 1st. The rank
 * prints only once the pool has a result, before that the order is the seeding. Columns answer to the table's own width so it fits a 360px
 * phone: #, Team, W, L, T, GD and Pts always; GP, GF and GA from 24rem (`.sx-col-wide`); the team's club under
 * its name from 768px.
 *
 * A followed team is bold with the star (`data-fest-team`); the page's own team(s) are bold as `.sx-self`.
 */
export function FestivalPoolTable({ pool, showClub = true }: { pool: PoolTableModel; showClub?: boolean }) {
  return (
    <div className="sx-tablewrap">
      <table className="sx-table">
        <caption className="sr-only">
          {pool.divisionShort} {pool.name}, in TourneyMachine’s order, teams level on every figure ranked equal: {pool.status}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sx-col-rank">
              #
            </th>
            <th scope="col" className="sx-col-team">
              Team
            </th>
            <th scope="col" className="sx-col-wide relative">
              <Abbr short="GP" long="Games played" />
            </th>
            <th scope="col" className="relative">
              <Abbr short="W" long="Wins" />
            </th>
            <th scope="col" className="relative">
              <Abbr short="L" long="Losses" />
            </th>
            <th scope="col" className="relative">
              <Abbr short="T" long="Ties" />
            </th>
            <th scope="col" className="sx-col-wide relative">
              <Abbr short="GF" long="Goals for" />
            </th>
            <th scope="col" className="sx-col-wide relative">
              <Abbr short="GA" long="Goals against" />
            </th>
            <th scope="col" className="relative">
              <Abbr short="GD" long="Goal difference" />
            </th>
            <th scope="col" className="sx-col-key relative">
              <Abbr short="Pts" long="Points" />
            </th>
          </tr>
        </thead>
        <tbody>
          {pool.rows.map((row) => (
            // `relative`: the name's `.sx-rowlink` stretches over the row, so the whole row opens the team.
            <tr key={row.team.id} className={['relative', row.self ? 'sx-self' : null].filter(Boolean).join(' ')}>
              <td className="sx-num sx-col-rank">
                {row.rank === null ? (
                  '—'
                ) : row.tied ? (
                  <>
                    <span aria-hidden="true">={row.rank}</span>
                    <span className="sr-only">tied {row.rank}</span>
                  </>
                ) : (
                  row.rank
                )}
              </td>
              <th scope="row" className="sx-col-team">
                <span className="block min-w-0 overflow-hidden text-ellipsis">
                  <span data-fest-team={row.team.slug}>
                    <Link href={row.team.href} prefetch={false} className="sx-rowlink">
                      {row.team.name}
                    </Link>
                    <span className="sx-pin-note" hidden>
                      Following
                    </span>
                  </span>
                </span>
                {showClub ? (
                  <span className="hidden overflow-hidden text-micro font-normal text-ellipsis text-ink-2 md:block">
                    {row.team.clubName}
                  </span>
                ) : null}
              </th>
              <td className="sx-num sx-col-wide">{row.gp}</td>
              <td className="sx-num">{row.w}</td>
              <td className="sx-num">{row.l}</td>
              <td className="sx-num">{row.t}</td>
              <td className="sx-num sx-col-wide">{row.gf}</td>
              <td className="sx-num sx-col-wide">{row.ga}</td>
              <td className="sx-num">{row.gd}</td>
              <td className="sx-num sx-col-key">{row.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A column head: the short form for the eye, the long form for a screen reader (the standings tables' `Abbr`). */
function Abbr({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{long}</span>
    </>
  );
}

export default FestivalPoolTable;
