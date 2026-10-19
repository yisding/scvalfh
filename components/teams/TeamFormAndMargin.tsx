import EmptyState from '@/components/ui/EmptyState';
import FormStrip from '@/components/ui/FormStrip';
import MarginStrip from '@/components/ui/MarginStrip';
import SectionHeader from '@/components/ui/SectionHeader';
import { shortDate } from '@/lib/format/dates';
import { formStripName, plural } from '@/lib/format/words';
import type { TeamPageLayout } from '@/views/teams/team-page';
import type { TeamPageView } from '@/views/teams/team-view';

/**
 * Form and Margin, side by side from 1024px, or the ONE empty state a team with no league result
 * gets in their place.
 */
export default function TeamFormAndMargin({
  view,
  layout,
}: {
  view: TeamPageView;
  layout: Pick<TeamPageLayout, 'hasPlayedLeagueGames' | 'firstLeagueGame' | 'maxprepsAction'>;
}) {
  const { team, formEntries, nonLeagueLog, leaguePlayed, leagueScheduled, marginEntries } = view;
  const { hasPlayedLeagueGames, firstLeagueGame, maxprepsAction } = layout;
  // A team with no reported results gets ONE empty state here, not an empty form strip
  // beside an empty chart (DESIGN §8).
  return (
    <>
      {hasPlayedLeagueGames ? (
        <>
          <section className="min-w-0 md:max-lg:col-span-2">
            <SectionHeader kicker="Form" meta="League, oldest to newest" />
            {/* 24px chips fill more of their 40px tap boxes, so the five read as one sequence;
                the direction is in the heading's meta, and the non-league count gets its own
                line instead of trailing off the end of the strip. */}
            <div className="sx-card p-4 md:p-5">
              <div className="flex min-h-11 items-center">
                <FormStrip
                  className="-ml-2"
                  entries={formEntries}
                  size={24}
                  label={formStripName(team.name, formEntries.length)}
                />
              </div>
              {nonLeagueLog.length > 0 ? (
                <p className="mt-2 mb-0 text-meta text-ink-3">
                  {`+ ${plural(nonLeagueLog.length, 'other game')}, not counted here`}
                </p>
              ) : null}
            </div>
          </section>

          <section className="min-w-0 md:max-lg:col-span-2 lg:row-span-2">
            <SectionHeader
              kicker="Margin by league game"
              meta={`${leaguePlayed} played`}
            />
            {/* `slots`: the team's real league slate (`leagueScheduled`, from the official
                schedule or the league's games per team). A league with no fixed schedule (the
                Sunset) has no slate to draw ahead, so its axis is the games it has: no `?` slots. */}
            <div className="sx-card p-4 md:p-5">
              <div data-twin className="hidden md:block">
                <MarginStrip
                  entries={marginEntries}
                  teamName={team.name}
                  slots={leagueScheduled ?? marginEntries.length}
                  height={200}
                />
              </div>
              <div data-twin className="md:hidden">
                <MarginStrip
                  entries={marginEntries}
                  teamName={team.name}
                  slots={leagueScheduled ?? marginEntries.length}
                  height={160}
                />
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="min-w-0 md:col-span-2">
          <SectionHeader kicker="Form and goal margin" />
          {firstLeagueGame ? (
            <EmptyState
              heading={`${team.name} has not played a ${view.scopeLabel} game yet.`}
              action={maxprepsAction}
            >
              The first is {shortDate(firstLeagueGame.dateLocal)}{' '}
              {firstLeagueGame.away.slug === team.slug && firstLeagueGame.site !== 'neutral' ? 'at' : 'vs'}{' '}
              {firstLeagueGame.away.slug === team.slug ? firstLeagueGame.home.name : firstLeagueGame.away.name}. Their
              schedule is below.
            </EmptyState>
          ) : (
            <EmptyState
              heading={`No league results reported for ${team.name}.`}
              action={maxprepsAction}
            >
              Their schedule is below, and MaxPreps may have results we have not picked up yet. We
              do not fill the gap with zeroes.
            </EmptyState>
          )}
        </section>
      )}
    </>
  );
}
