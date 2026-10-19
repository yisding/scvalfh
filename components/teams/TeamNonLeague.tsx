import SectionHeader from '@/components/ui/SectionHeader';
import { plural } from '@/lib/format/words';
import type { TeamPageView } from '@/views/teams/team-view';

import TeamGameLog from './TeamGameLog';

/** The Non-league (and postseason) game log. */
export default function TeamNonLeague({ view }: { view: TeamPageView }) {
  const { team, nonLeagueLog } = view;
  return (
    <section className="min-w-0 md:max-lg:col-span-2">
      <SectionHeader
        kicker={view.postseasonCount > 0 ? 'Non-league and postseason' : 'Non-league'}
        meta={plural(nonLeagueLog.length, 'game')}
      />
      <TeamGameLog
        games={nonLeagueLog}
        perspective={team.slug}
        emptyHeading={`${team.name} has no non-league games this season.`}
        emptyBody={`Every game on their schedule counts toward the ${view.scopeLabel} table.`}
      />
    </section>
  );
}
