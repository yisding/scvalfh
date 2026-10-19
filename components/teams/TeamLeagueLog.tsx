import SectionHeader from '@/components/ui/SectionHeader';
import { plural } from '@/lib/format/words';
import type { TeamPageView } from '@/views/teams/team-view';

import TeamGameLog from './TeamGameLog';

/**
 * The League game log. It spans two rows at 1024px+ when `leagueLogSpans` (the official-only
 * fixtures card exists and there are league results), so the short cards beside it stack.
 */
export default function TeamLeagueLog({
  view,
  leagueLogSpans,
}: {
  view: TeamPageView;
  leagueLogSpans: boolean;
}) {
  const { team, leagueLog, leagueScheduled, leaguePlayed } = view;
  return (
    <section
      id="league-log"
      className={
        leagueLogSpans
          ? 'min-w-0 md:max-lg:col-span-2 lg:row-span-2'
          : 'min-w-0 md:max-lg:col-span-2'
      }
    >
      <SectionHeader
        kicker="League game log"
        meta={leagueScheduled === null ? `${leaguePlayed} played` : `${leaguePlayed} of ${leagueScheduled}`}
        action={{ href: view.standingsHref, label: 'Standings' }}
      />
      <TeamGameLog
        games={leagueLog}
        perspective={team.slug}
        emptyHeading={`No league games are published for ${team.name}.`}
        emptyBody={
          view.officialScheduleUrl && leagueScheduled !== null
            ? `The official ${view.league.shortName} schedule has ${plural(
                leagueScheduled,
                `${view.league.gamesWord} game`,
              )} for them; none of those fixtures has a contest in any data source.`
            : view.league.classification === 'membership'
              ? // The San Diego leagues: every game between two division members is a league game.
                `No game between ${team.name} and another ${view.scopeLabel} team is on MaxPreps’ schedules yet.`
              : // No official schedule to compare with: the league games are the ones MaxPreps marks.
                `MaxPreps marks none of ${team.name}’s games as ${view.league.shortName} league games yet.`
        }
      />
    </section>
  );
}
