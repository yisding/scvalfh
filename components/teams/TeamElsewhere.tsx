import Link from 'next/link';

import { DATA_CORRECTIONS_URL } from '../layout/site';
import ExternalLink from '../ui/ExternalLink';
import { ordinal } from '../../lib/format';
import { getHistorySeason } from '../../lib/history/history';
import type { Team } from '../../lib/types';
import type { TeamPageParts } from './team-page-view';

/**
 * The team page's Elsewhere block, last in the rail (DESIGN §33): one row of links to the team's
 * pages on MaxPreps and si.com, its league's official schedule where the league publishes one, and
 * the way to report an error; then last season in one line.
 */
export function TeamElsewhere({
  team,
  sblive,
  history,
  historySize,
  historyScope,
  officialSchedule,
}: {
  team: Team;
  /** The division's own official schedule and the league's short name; a league that publishes none (the EAL) has no link. */
  officialSchedule?: { href: string; leagueShort: string } | null;
  /** @deprecated The page has one column and a rail; ignored. */
  logOutweighs?: boolean;
} & Pick<TeamPageParts, 'sblive' | 'history' | 'historySize' | 'historyScope'>) {
  return (
    <section className="sx-section" aria-labelledby="elsewhere-heading">
      <h2 id="elsewhere-heading">Elsewhere</h2>
      <ul className="sx-linkrow mt-0">
        {team.external.maxprepsTeamUrl ? (
          <li>
            <ExternalLink href={team.external.maxprepsTeamUrl} className="sx-action">
              MaxPreps
            </ExternalLink>
          </li>
        ) : null}
        {team.external.maxprepsScheduleUrl ? (
          <li>
            <ExternalLink href={team.external.maxprepsScheduleUrl} className="sx-action">
              MaxPreps schedule
            </ExternalLink>
          </li>
        ) : null}
        {sblive ? (
          <li>
            <ExternalLink href={sblive} className="sx-action">
              SI.com
            </ExternalLink>
          </li>
        ) : null}
        {officialSchedule ? (
          <li>
            <ExternalLink href={officialSchedule.href} className="sx-action">
              Official {officialSchedule.leagueShort} schedule
            </ExternalLink>
          </li>
        ) : null}
        <li>
          <ExternalLink href={DATA_CORRECTIONS_URL} className="sx-action">
            Report an error
          </ExternalLink>
        </li>
      </ul>
      {/* Last season in one line, record exactly as the league's standings printed it ("1-13":
          SCVAL's PDF drops a zero tie count on some rows). */}
      {history ? (
        <p className="sx-note">
          Last season ({getHistorySeason()}): {ordinal(history.row.place)} of {historySize} in {historyScope},{' '}
          <span className="whitespace-nowrap">{history.row.leagueRecord}.</span>{' '}
          <Link href={`/history/2025-26#${history.division}`} prefetch={false} className="sx-link whitespace-nowrap">
            {getHistorySeason()} standings
          </Link>
        </p>
      ) : null}
    </section>
  );
}

export default TeamElsewhere;
