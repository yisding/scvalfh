import { EM_DASH, recordString } from '../../lib/format';
import type { Team } from '../../lib/types';
import EmptyState from '../ui/EmptyState';
import GhostMonogram from '../ui/GhostMonogram';
import { TeamRowLink } from '../ui/PinNote';
import PlaceMark from '../ui/PlaceMark';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import type { JvTableView } from './jv-standings-view';

/**
 * A JV slot team's name cell (York): its logo, or a letter square without one, and its name, linking the
 * JV section of the school whose slot it plays, where its games are listed. The link's accessible
 * name says whose page it opens, so "York" is not read as a page of its own.
 */
function SlotTeamCell({ name, mascot, host }: { name: string; mascot: string | null; host: Team | null }) {
  return (
    <span className="sx-teamcell">
      {mascot ? <TeamMonogram team={{ slug: mascot, name }} size={24} /> : <GhostMonogram name={name} size={24} />}
      {host ? (
        <TeamRowLink href={`/teams/${host.slug}#jv`} label={`${name}, JV games on ${host.shortName}’s page`}>
          {name}
        </TeamRowLink>
      ) : (
        <span>{name}</span>
      )}
    </span>
  );
}

/**
 * One league's JV tables on `/jv` (`#<division>` each): its divisions' blocks, in config order, two
 * across from 1024 (`.sx-two`); a single table takes one of the two columns, never the page's whole width.
 *
 * A table is the site's one table look (`.sx-tablewrap` > `.sx-table`, DESIGN §33): place, team with
 * its logo (the whole row one link to the school's JV section; the reader's team bold with the star),
 * the record, the order column — points, or the winning percentage where the league's record orders
 * its tables — then for and against, which a table narrower than 20rem drops. No qualification line:
 * no JV place leads anywhere. A division of a multi-division league is headed by a strip. A division
 * without a table says why in one line. How the tables are built is on /about#jv.
 */
export function JvStandings({ views, multi }: { views: readonly JvTableView[]; multi: boolean }) {
  return (
    <div className="sx-two gap-y-5">
      {views.map((view) => (
        <div key={view.division} id={view.anchor ?? undefined} className="min-w-0">
          {multi ? <SectionHeader strip kicker={view.title} /> : null}
          {view.status === 'shown' || view.preseason ? (
            <JvTable view={view} />
          ) : (
            <EmptyState heading={view.emptyHeading ?? ''} className={multi ? 'pt-2' : undefined} />
          )}
        </div>
      ))}
    </div>
  );
}

function JvTable({ view }: { view: JvTableView }) {
  return (
    <div className="sx-tablewrap">
      <table className="sx-table">
        <caption className="sr-only">
          {view.preseason ? `${view.title} teams; no league game played yet` : `${view.title} standings, unofficial`}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sx-col-rank">
              #
            </th>
            <th scope="col" className="sx-col-team">
              Team
            </th>
            <th scope="col">{view.heads.record}</th>
            <th scope="col" className="sx-col-key" title={view.heads.orderTitle}>
              {view.heads.order}
            </th>
            <th scope="col" className="sx-col-mid" title={view.heads.scoredForTitle}>
              {view.heads.scoredFor}
            </th>
            <th scope="col" className="sx-col-mid" title={view.heads.scoredAgainstTitle}>
              {view.heads.scoredAgainst}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map(({ row, team, mascot, slotHost, orderText }) => {
            const has = row.record.gp > 0;
            return (
              <tr key={row.teamId} data-team-slug={team?.slug}>
                <td className="sx-col-rank sx-num">
                  <PlaceMark place={row.record.place} shared={row.shared} ranked={has} />
                </td>
                <th scope="row" className="sx-col-team">
                  {team ? (
                    <span className="sx-teamcell">
                      <TeamMonogram team={team} size={24} />
                      <span>
                        <TeamRowLink href={`/teams/${team.slug}#jv`} label={`${team.name} JV games and roster`}>
                          {team.shortName}
                        </TeamRowLink>
                        {/* The star. aria-hidden: the row link's own sentence already starts "Your team." */}
                        <span className="sx-pin-note" aria-hidden="true" hidden>
                          Your team
                        </span>
                      </span>
                    </span>
                  ) : (
                    // A JV slot team (York): no page of its own. Its JV games are on the page of the school
                    // whose slot it plays (Santa Catalina's `#jv`), so the row links there, and says so
                    // to a screen reader; its own logo, or a letter square without one.
                    <SlotTeamCell name={row.name} mascot={mascot} host={slotHost} />
                  )}
                </th>
                <td className="sx-num">{has ? recordString(row.record) : EM_DASH}</td>
                <td className="sx-num sx-col-key">{has ? orderText : EM_DASH}</td>
                <td className="sx-num sx-col-mid sx-col-quiet">{has ? row.record.gf : EM_DASH}</td>
                <td className="sx-num sx-col-mid sx-col-quiet">{has ? row.record.ga : EM_DASH}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default JvStandings;
