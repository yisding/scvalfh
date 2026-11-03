import Link from 'next/link';

import TeamMonogram from '../ui/TeamMonogram';
import type { Team } from '../../lib/types';

const CHAMPION_CARD = 'sx-card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 p-4 sm:p-5';

/**
 * A champion's card. A registry champion's whole card is a link to its team page, as the same
 * school's row is in the standings table and the awards below (HistoryStandingsTable,
 * AwardsBlock); a champion outside the registry has no page here, so its card stays inert.
 */
export default function ChampionCard({ team, children }: { team: Team | undefined; children: React.ReactNode }) {
  const body = (
    <>
      {team ? <TeamMonogram team={team} size={40} /> : null}
      <div className="col-start-2 min-w-0">{children}</div>
    </>
  );
  return team ? (
    <Link href={`/teams/${team.slug}`} prefetch={false} className={`${CHAMPION_CARD} sx-lift no-underline`}>
      {body}
    </Link>
  ) : (
    <div className={CHAMPION_CARD}>{body}</div>
  );
}
