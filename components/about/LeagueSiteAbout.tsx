import Link from 'next/link';

import { DATA_CORRECTIONS_URL } from '../layout/site';
import PageHeader from '../layout/PageHeader';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { listWords } from '../../lib/format';
import { LEAGUES } from '../../lib/leagues';
import { SPORT, SPORT_AUDIENCE, SPORT_SEASON } from '../../lib/sports/current';
import { teamsidelinePageUrl } from '../../lib/sports/league-site';
import { TEAMS } from '../../lib/teams';
import RatingsSection from './sections/RatingsSection';

/**
 * /about for a build read from a league's own TeamSideline site rather than MaxPreps (lib/sports/shape.ts
 * TeamsidelineSportSeason: the Valley Athletic League's middle school girls soccer). The high school builds' About
 * page describes MaxPreps, si.com, cifsshome.org, the CIF sections and their cross-checks, none of which reads a
 * game here, so this page says what is true of this build instead, under the same anchors the site's other pages
 * link to (#sources, #standings, #rules-<league>, #ratings, #conventions, #jv, #updates, #freshness, #playoffs,
 * #a11y, #privacy, #contact, #corrections, #not-affiliated). Every rule it states is read from the league's config,
 * with its citation.
 */
export default function LeagueSiteAbout() {
  const season = SPORT_SEASON;
  if (season.primary !== 'teamsideline') throw new Error('components/about/LeagueSiteAbout.tsx: a build read from MaxPreps has the main About page');
  const teamsidelineLevelUrl = (level: 'main' | 'second') => teamsidelinePageUrl(season.origin, season.pages[level]);
  const main = season.pages.main;
  const second = season.pages.second;
  const host = new URL(season.origin).host;
  return (
    <div className="pb-section-lg">
      <PageHeader title="About" stamp />
      <p className="mt-2 mb-0 max-w-prose text-body text-ink">
        This is an unofficial, fan-built scoreboard for the {TEAMS.length} {SPORT_AUDIENCE} teams of{' '}
        {listWords(LEAGUES.map((l) => `the ${l.name} (${l.shortName})`))}. Every game, score and the league&rsquo;s own
        table come from the league&rsquo;s site, {host}. To report a mistake, post it in the{' '}
        <ExternalLink href={DATA_CORRECTIONS_URL}>Data errors thread on our forum</ExternalLink>.
      </p>

      <div className="sx-prose">
        <section id="sources" className="sx-section">
          <SectionHeader kicker="Where the data comes from" />
          <p>
            {`The league publishes its season on ${host}, one schedule page for each level: the ${main.subtitle.toLowerCase()} page, the one this site’s tables, schedule and playoff picture are built from, and the ${second.subtitle.toLowerCase()} page, whose games are on this site’s ${second.subtitle} pages. Each page lists every game with its day, time and field, its score once the league enters it, and the league’s own table. The site reads nothing else: MaxPreps and si.com carry none of these schools.`}
          </p>
          <ul>
            <li>
              <ExternalLink href={teamsidelineLevelUrl('main')}>{`${season.label}, ${main.subtitle}`}</ExternalLink>
            </li>
            <li>
              <ExternalLink href={teamsidelineLevelUrl('second')}>{`${season.label}, ${second.subtitle}`}</ExternalLink>
            </li>
            {LEAGUES.flatMap((l) => l.links.filter((link) => !link.href.includes('/schedule/'))).map((link) => (
              <li key={link.href}>
                <ExternalLink href={link.href}>{link.label}</ExternalLink>
              </li>
            ))}
          </ul>
        </section>

        <section id="standings" className="sx-section">
          <SectionHeader kicker="How the standings are computed" />
          {LEAGUES.map((l) => (
            <div key={l.id} id={`rules-${l.id}`}>
              <p>
                {`Each table is computed here from the games’ scores: ${l.rules.points.win} points for a win, ${l.rules.points.tie} for a tie and ${l.rules.points.loss} for a loss (${l.rules.citations.points}), ordered by points. Each team plays every other once (${l.rules.citations.doubleRoundRobin}). A game level at full time stays a tie (${l.rules.citations.overtime}).`}
              </p>
              <p>{`Teams level on points are separated by the league’s playoff seeding tiebreakers, in order: ${listWords(
                (l.rules.tiebreaks.default ?? []).map((stage) => l.rules.citations.stages[stage] ?? stage),
              )}.`}</p>
            </div>
          ))}
        </section>

        <RatingsSection />

        <section id="conventions" className="sx-section">
          <SectionHeader kicker="How a game is read" />
          <p>
            {`A game is final once the league’s page gives both scores. A level score is a tie, except where the page marks one side the winner, which it does for a playoff game decided on ${SPORT.scoring.tiebreak?.words ?? 'a tiebreak'}: that game is shown as won on ${SPORT.scoring.tiebreak?.words ?? 'a tiebreak'}, with no tally, since the page prints none. A game the league moves to another day keeps its page here, and its comment (“Moved to 1/13.”) is the league’s.`}
          </p>
        </section>

        <section id="jv" className="sx-section">
          <SectionHeader kicker={`${second.subtitle} games`} />
          <p>
            {`The ${second.subtitle.toLowerCase()} teams play the same schools on the same days as the ${main.subtitle.toLowerCase()} teams, each game at the other school’s field. Their games, scores and a table computed the same way are on the `}
            <Link href="/jv" prefetch={false}>
              {`${second.subtitle} pages`}
            </Link>
            {`. They are kept apart from the ${main.subtitle.toLowerCase()} tables, ratings and playoffs.`}
          </p>
        </section>

        <section id="freshness" className="sx-section">
          <span id="updates" className="block" />
          <SectionHeader kicker="How fresh the data is" />
          <p>
            {`Pages do not load live data. An automatic update re-reads the league’s two schedule pages twice a day in season and republishes the whole site when something changed; a score appears here after the league enters it and the next update runs.`}
          </p>
        </section>

        <section id="playoffs" className="sx-section">
          <SectionHeader kicker="Playoffs" />
          {LEAGUES.map((l) => {
            const ps = l.postseason;
            if (ps.kind !== 'league-tournament') return null;
            return (
              <p key={l.id}>
                {`${ps.citations.format}. ${ps.citations.semifinal}. Seeding: ${ps.citations.seeding}. ${ps.shootoutNote} The picture under `}
                <Link href={`/playoffs/${l.id}`} prefetch={false}>
                  {ps.name}
                </Link>
                {' is projected from the table until the league seeds it.'}
              </p>
            );
          })}
        </section>

        <section id="a11y" className="sx-section">
          <span id="privacy" className="block" />
          <SectionHeader kicker="Privacy &amp; accessibility" />
          <p>
            {`The players are children, so this site names none: no roster, no player and no statistic of a player is published or collected, whatever a source lists. It stores exactly three things, all only in your browser: a theme choice, a pinned team and the league you chose to see on the home page. None of it is ever sent anywhere: there are no accounts, no analytics, no tracking cookies and no requests to other sites from any page.`}
          </p>
          <p>
            {`Every result is a letter and a written word, never color alone; every score has a full sentence for screen readers; the site’s text and background colors meet the WCAG AA contrast standard. The league publishes no school colors, so every team badge has the same neutral color and the school’s initials.`}
          </p>
        </section>

        <section id="contact" className="sx-section">
          <span id="corrections" className="block" />
          <SectionHeader kicker="Corrections &amp; contact" />
          <p>
            Spot a wrong score, a missing game or a record that does not add up? Post it in the{' '}
            <ExternalLink href={DATA_CORRECTIONS_URL}>Data errors thread on our forum</ExternalLink>. Every game here
            comes from the league&rsquo;s own pages, so if a score is wrong there too, the school&rsquo;s athletic
            director can have the league correct it, and the next update picks it up.
          </p>
        </section>

        <section id="not-affiliated" className="sx-section">
          <SectionHeader kicker="Not affiliated" />
          <p>
            {`This site is not affiliated with ${listWords(LEAGUES.map((l) => `the ${l.name}`))}, its schools or their school districts, TeamSideline, MaxPreps or Sports Illustrated. Names belong to their owners; the scores are facts the league publishes.`}
          </p>
        </section>
      </div>
    </div>
  );
}
