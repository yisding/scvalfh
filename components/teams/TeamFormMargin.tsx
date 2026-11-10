import { SCORE_UNIT } from '../words/score-words';
import EmptyState from '../ui/EmptyState';
import FormStrip from '../ui/FormStrip';
import SectionHeader from '../ui/SectionHeader';
import { formStripName, plural } from '../words/plural';
import { shortDate } from '../../lib/format';

import MarginStrip from './MarginStrip';
import type { TeamPageParts } from './team-page-view';
import type { TeamPageView } from './team-view';

/**
 * The team page's Form and Margin sections (two grid items), or, for a team with no league game played,
 * one empty state in their place, naming the first league game when every one is still to come.
 */
export function TeamFormMargin({
  view,
  hasPlayedLeagueGames,
  firstLeagueGame,
  maxprepsAction,
}: {
  view: TeamPageView;
} & Pick<TeamPageParts, 'hasPlayedLeagueGames' | 'firstLeagueGame' | 'maxprepsAction'>) {
  const { team, formEntries, nonLeagueLog, leaguePlayed, marginEntries, leagueScheduled } = view;
  // A team with no reported results gets ONE empty state here, not an empty form strip
  // beside an empty chart (DESIGN §8).
  return hasPlayedLeagueGames ? (
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
      <SectionHeader kicker={`Form and ${SCORE_UNIT} margin`} />
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
  );
}

export default TeamFormMargin;
