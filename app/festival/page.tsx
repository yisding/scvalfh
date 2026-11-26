import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import FestivalChrome from '../../components/festival/FestivalChrome';
import FestivalGameList from '../../components/festival/FestivalGameList';
import TeamCard from '../../components/festival/TeamCard';
import { buildFestivalFollowCss } from '../../components/festival/follow-css';
import { buildHubView } from '../../components/festival/hub-view';
import { DATA_CORRECTIONS_URL, OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import ExternalLink from '../../components/ui/ExternalLink';
import SectionHeader from '../../components/ui/SectionHeader';
import { plural } from '../../components/words/plural';
import { FESTIVAL_GAME_MINUTES, festivalTeamSlugs } from '../../lib/festival/festival';
import { HAS_FESTIVAL } from '../../lib/sports/current';

/**
 * /festival — "How are our teams doing at the National Hockey Festival?" (DESIGN §35).
 *
 * The 2026 National Hockey Festival (USA Field Hockey; Naples, Fla.; Nov 26–28) from TourneyMachine's feed,
 * committed as data/field-hockey/festival.json and refreshed by .github/workflows/update-data-festival.yml while
 * games are on. Static like every page: a new score is a new deploy.
 *
 * Source order is reading order: where the event stands (from the file's statuses, never the clock); "Your
 * teams", every team's card shipped hidden and shown by the followed-team stylesheet (the hub's own sheet,
 * `cards`), with an empty state for no follows or no JS; the California teams, Northern then Southern; the latest
 * slot with a result and the next slot; the divisions; the clubs; and how the results are made.
 *
 * Heading outline: h1 → h2 Your teams (→ h3 per card) → h2 California teams (→ h3 Northern / Southern California
 * → h4 per team) → h2 Latest results → h2 Up next → h2 Divisions → h2 Clubs → h2 About these results. Field
 * hockey's alone: another sport's build renders a 404. Takes the root OG card.
 */
const PAGE_TITLE = 'National Hockey Festival';

export function generateMetadata(): Metadata {
  if (!HAS_FESTIVAL) return { title: 'Page not found' };
  const view = buildHubView();
  const description = `Scores, pool tables and finals of the ${view.name}, ${view.place}, ${view.dates}: ${plural(view.teams, 'team')}, ${view.finals} of ${plural(view.games, 'game')} final, from TourneyMachine. Follow your teams; California teams first. Unofficial.`;
  return {
    title: PAGE_TITLE,
    description,
    alternates: { canonical: '/festival' },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, description, url: '/festival' },
  };
}

export default function FestivalPage() {
  if (!HAS_FESTIVAL) notFound();
  const view = buildHubView();
  const cardsCss = buildFestivalFollowCss(festivalTeamSlugs(), { marks: false, cards: true });

  return (
    <div className="pb-section-lg">
      <FestivalChrome
        title={view.name}
        current="overview"
        meta={
          <>
            <span>{view.place}</span>
            <span>{view.dates}</span>
          </>
        }
      />
      <p className="mt-3 mb-0 text-body font-semibold text-ink">{view.status}</p>

      <section aria-labelledby="your-teams" className="sx-section">
        <style dangerouslySetInnerHTML={{ __html: cardsCss }} />
        <SectionHeader id="your-teams" kicker="Your teams" />
        <p data-fest-empty="" className="sx-empty max-w-prose">
          Tap Follow on any team to keep its games here. Saved in this browser only.
        </p>
        <ul className="m-0 list-none p-0">
          {view.cards.map((card) => (
            <TeamCard key={card.team.id} card={card} hiddenUntilFollowed />
          ))}
        </ul>
      </section>

      {view.california.length > 0 ? (
        <section aria-labelledby="california" className="sx-section">
          <SectionHeader id="california" kicker="California teams" action={{ href: '/festival/clubs', label: 'All clubs' }} />
          {view.california.map((group) => (
            <div key={group.id} className="mt-4">
              <SectionHeader strip kicker={group.heading} meta={plural(group.clubs.reduce((n, c) => n + c.teams.length, 0), 'team')} />
              {group.clubs.map((club) => (
                <div key={club.slug} className="mt-3">
                  <ul className="sx-linkrow mt-0 text-cell text-ink-2">
                    <li>
                      <Link href={club.href} prefetch={false} className="sx-action">
                        {club.name}
                      </Link>
                    </li>
                    {club.region ? <li className="inline-flex items-center">{club.region}</li> : null}
                    {club.site ? (
                      <li>
                        <Link href={club.site.href} prefetch={false} className="sx-action">
                          {club.site.name} on this site
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                  <ul className="m-0 list-none p-0">
                    {club.teams.map((card) => (
                      <TeamCard key={card.team.id} card={card} as="h4" />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      {view.latest ? (
        <section aria-labelledby="latest" className="sx-section">
          <SectionHeader id="latest" kicker="Latest results" meta={view.latest.heading} />
          <FestivalGameList games={view.latest.rows} />
        </section>
      ) : null}

      {view.next ? (
        <section aria-labelledby="up-next" className="sx-section">
          <SectionHeader id="up-next" kicker="Up next" meta={view.next.heading} action={{ href: '/festival/schedule', label: 'Full schedule' }} />
          <FestivalGameList games={view.next.rows} />
        </section>
      ) : null}

      <section aria-labelledby="divisions" className="sx-section">
        <SectionHeader id="divisions" kicker="Divisions" meta={plural(view.divisions.length, 'division')} />
        <ul className="m-0 list-none p-0">
          {view.divisions.map((d) => (
            <li key={d.slug} className="flex flex-wrap items-baseline gap-x-3 border-t border-hairline py-2 first:border-t-0">
              <Link href={d.href} prefetch={false} className="sx-action font-semibold">
                {d.short}
              </Link>
              <span className="text-cell text-ink-2">
                {d.format} · {d.facts}
              </span>
              {d.hasBracket ? (
                <Link href={`${d.href}#bracket`} prefetch={false} className="sx-action ml-auto">
                  Finals
                  <span className="sr-only"> &mdash; {d.short}</span>
                </Link>
              ) : (
                <Link href={`${d.href}#pools`} prefetch={false} className="sx-action ml-auto">
                  Pools
                  <span className="sr-only"> &mdash; {d.short}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="clubs" className="sx-section">
        <SectionHeader id="clubs" kicker="Clubs" meta={plural(view.clubs.length, 'club')} action={{ href: '/festival/clubs', label: 'All clubs' }} />
        <ul className="m-0 flex list-none flex-wrap gap-x-5 p-0">
          {view.clubs.map((club) => (
            <li key={club.slug}>
              <Link href={club.href} prefetch={false} className="sx-action">
                {club.name}
              </Link>
              <span className="text-cell text-ink-2"> ({club.teams})</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about" className="sx-section">
        <SectionHeader id="about" kicker="About these results" />
        <div className="flex max-w-prose flex-col gap-3 text-body text-ink-2">
          <p className="m-0">
            Scores, pool tables and finals come from the event’s results on{' '}
            <ExternalLink href={view.resultsUrl}>TourneyMachine</ExternalLink>, where USA Field Hockey posts them; the
            event itself is on <ExternalLink href={view.infoUrl}>USA Field Hockey’s site</ExternalLink>. Times are the
            venue’s, Eastern (ET), with Pacific (PT) beside each time slot. Games last {FESTIVAL_GAME_MINUTES} minutes.
          </p>
          <p className="m-0">
            The festival crowns no division champion. USA Field Hockey awards Pool Champion medals: to each pool’s
            table winner, or, where two pools are paired for Saturday’s crossover finals (1st v 1st, 2nd v 2nd and so
            on), to the winner of their 1st-place final. Six-team pools play only pool games, which give every team the
            five games the festival guarantees.
          </p>
          <p>
            Pool tables are in TourneyMachine’s order. USA Field Hockey’s regulations give 3 points for a win, 1 for a
            tie and 0 for a loss, and break a tie on points by matches won, then goal difference, then goals for, then
            the head-to-head result, then a shoot-out (D.2); three or more teams level are ranked on the games among
            them only (D.3). A final level at the end goes straight to a shoot-out (D.4); TourneyMachine does
            not post shoot-outs, so such a game shows “Tied — shoot-out” here, with no winner. TourneyMachine lists teams
            level on points, wins, goal difference and goals for alphabetically, and posts no head-to-head result or
            shoot-out to separate them, so here they share a rank (“=1”), and the final their place feeds is
            not settled until the event staff fill it in.
          </p>
          <p>
            While games are on, this page is checked for new scores three times an hour (about 10, 30 and 50 minutes
            after each hour’s games end), and a new result appears here a few minutes after the check that finds it.
            Scores at the fields are often entered late. These results are unofficial: TourneyMachine and the event
            staff are the ones to trust.
          </p>
          <p className="mb-0">
            See a wrong score or a team under the wrong club?{' '}
            <ExternalLink href={DATA_CORRECTIONS_URL}>Report it</ExternalLink>.
          </p>
        </div>
      </section>
    </div>
  );
}
