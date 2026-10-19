import EmptyState from '@/components/ui/EmptyState';
import { GameCard, GameRow } from '@/components/ui/GameRow';
import SectionHeader from '@/components/ui/SectionHeader';
import { shortDate } from '@/lib/format/dates';
import { gameKindLabel } from '@/views/shared/describe-game';
import type { TeamPageLayout } from '@/views/teams/team-page';
import type { TeamPageView } from '@/views/teams/team-view';

/**
 * The LAST card of the team page: the most recent game that was played (a `GameRow` on a phone, a
 * `GameCard` from 768px), or the empty state with the MaxPreps action.
 */
export default function TeamLastGame({
  view,
  maxprepsAction,
}: {
  view: Pick<TeamPageView, 'team' | 'last'>;
  maxprepsAction: TeamPageLayout['maxprepsAction'];
}) {
  const { team, last } = view;
  // LAST and NEXT: the two questions a parent on the turf actually has. "All games" jumps
  // to the full league log (`#league-log`), otherwise seven sections further down.
  return (
    <section className="flex min-w-0 flex-col">
      <SectionHeader
        kicker="Last"
        meta={
          last
            ? `${shortDate(last.dateLocal)} · ${gameKindLabel(last)}`
            : undefined
        }
        action={{ href: '#league-log', label: 'All games' }}
      />
      {last ? (
        <>
          <div data-twin className="sx-card sx-flush sx-bleed md:hidden">
            <GameRow game={last} perspective={team.slug} defaultExpanded showTime={false} />
          </div>
          <div data-twin className="hidden md:flex md:flex-1 md:flex-col">
            <GameCard game={last} perspective={team.slug} showStream linkStyle="pills" className="flex-1" />
          </div>
        </>
      ) : (
        <EmptyState heading={`No results reported for ${team.name}.`} action={maxprepsAction}>
          Their schedule is below, and MaxPreps may have results we have not picked up yet.
        </EmptyState>
      )}
    </section>
  );
}
