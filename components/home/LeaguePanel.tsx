import EmptyState from '../ui/EmptyState';
import LeagueHealthNote from '../ui/LeagueHealthNote';
import SectionHeader from '../ui/SectionHeader';
import { longDate } from '../../lib/format';

import type { HomeLeaguePanel } from './home-data';
import LatestScores from './LatestScores';
import LeagueTeams from './LeagueTeams';
import MiniStandings from './MiniStandings';
import NextSlate from './NextSlate';
import OtherLeaguesStrip from './OtherLeaguesStrip';
import PhaseLead from './PhaseLead';
import PostseasonCard from './PostseasonCard';

/**
 * One league's home panel (SPEC §10.1). Every league's panel is in the static HTML; the scope
 * stylesheet shows only the effective league's (`data-scope="<id>"`) before first paint, so a
 * remembered league never costs a layout shift and nothing is reordered with CSS: DOM order is the
 * reading order — where the season is, what just happened, the table, what is next, the teams, the
 * postseason, the other leagues.
 *
 * The heading `#league-<id>` is where focus lands after "Show <SHORT> here" (SPEC §8.2). Every id
 * inside includes the league id or comes from `useId()`, because all four panels share one page.
 */
export interface LeaguePanelProps {
  panel: HomeLeaguePanel;
}

const STACK = 'mt-section flex flex-col gap-y-section md:mt-section-lg md:gap-y-section-lg';

export function LeaguePanel({ panel }: LeaguePanelProps) {
  const headingId = `league-${panel.id}`;
  const { latest, unreported, slate } = panel;
  const multi = panel.divisions.length > 1;
  const lastDivision = panel.divisions.length - 1;

  return (
    <section data-scope={panel.id} aria-labelledby={headingId} className={STACK}>
      <SectionHeader id={headingId} kicker={`${panel.shortName} · ${panel.name}`} />

      <LeagueHealthNote leagueId={panel.id} />
      <PhaseLead lead={panel.lead} />

      {/* A day that was played and reported nothing is shown, not hidden (DESIGN §8). */}
      {unreported ? (
        <LatestScores
          kicker="Played, not reported"
          date={unreported.date}
          games={unreported.games}
          total={unreported.total}
          scopeLeague={panel.id}
          note={`${unreported.total} ${unreported.total === 1 ? 'game was' : 'games were'} on the schedule for ${longDate(
            unreported.date,
          )} and no score has been reported ${unreported.total === 1 ? 'for it' : 'for any of them'}. Scores usually appear the next morning.${
            latest ? ` The results below are from ${longDate(latest.date)}.` : ''
          }`}
        />
      ) : null}

      {latest ? (
        <LatestScores date={latest.date} games={latest.games} total={latest.total} scopeLeague={panel.id} />
      ) : (
        <section>
          <SectionHeader as="h3" kicker="Latest scores" />
          <EmptyState heading="No results yet." action={{ href: `/schedule/${panel.id}`, label: 'Full schedule' }}>
            {panel.firstGame
              ? `The first ${panel.shortName} games are ${longDate(panel.firstGame)}. Scores appear here the morning after they are played.`
              : 'Scores appear here the morning after a game is played.'}
          </EmptyState>
        </section>
      )}

      <div className={multi ? 'flex flex-col gap-y-section md:grid md:grid-cols-2 md:gap-x-6' : undefined}>
        {panel.divisions.map((division, i) => (
          <MiniStandings
            key={division.id}
            division={division}
            href={division.href}
            showDivisionLabel={division.heading !== null}
            home={division.home}
            legend={i === lastDivision ? panel.pointsLegend : undefined}
          />
        ))}
      </div>

      <NextSlate
        date={slate?.date ?? null}
        games={slate?.games ?? []}
        total={slate?.total ?? 0}
        isToday={slate?.isToday ?? false}
        kicker={latest ? undefined : 'First games'}
        after={panel.afterSchedule}
      />

      <LeagueTeams view={panel.teams} />
      <PostseasonCard view={panel.postseason} />
      <OtherLeaguesStrip lines={panel.others} />
    </section>
  );
}

export default LeaguePanel;
