import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BUILD_INSTANT } from '../../../components/layout/build-instant';
import LastUpdated from '../../../components/layout/LastUpdated';
import PageHeader from '../../../components/layout/PageHeader';
import { leagueChips, leagueHrefs } from '../../../components/layout/league-chips';
import { OG_BASE } from '../../../components/layout/site';
import ScopeBar from '../../../components/prefs/ScopeBar';
import GameList from '../../../components/schedule/GameList';
import DivisionStandings from '../../../components/standings/DivisionStandings';
import DivisionTabs from '../../../components/standings/DivisionTabs';
import { buildStandingsPageView } from '../../../components/standings/standings-page-view';
import { leaderClause, orderedOnWords } from '../../../components/standings/standings-view';
import ExternalLink from '../../../components/ui/ExternalLink';
import { getLeagueIds, getLeagueSummary, getToday, getUpcoming } from '../../../lib/data';
import { longDate, plural, shortDate } from '../../../lib/format';
import { hasHistory } from '../../../lib/history/history';
import { getLeague, leagueSportWords, standingsLabel } from '../../../lib/leagues';
import { SPORT } from '../../../lib/sports/current';

/**
 * /standings/<league> — "Where do WE stand?" (SPEC §8.1, §10.3; DESIGN §33): one league's full
 * standings.
 *
 * Under the title: the league row (links to the sibling leagues of the same region, and the short
 * "Updated" stamp; no region switch, the league fixes the region). From 1024 the page is a main
 * column and a 21rem rail; below that the rail follows the tables.
 *
 * Main: every division of the league on ONE page with a `#<division>` anchor each
 * (`/standings/scval#de-anza`, `/standings/bval#santa-teresa`), each a section headed by its name;
 * a single-division league has its one table under `id=<division>`. The page's job is comparison,
 * and anchors work with JavaScript off and are shareable (DESIGN §1.2).
 *
 * Rail: "Next games", the league's next game day (the date is the link to that day's scores), at
 * most five games, each with its competition as its note, then the way to the league's schedule.
 * Once the league has no game left the rail is omitted and the tables keep their own cap.
 *
 * A multi-division league has a division bar on a phone, sticky under the 48px top bar (the one
 * sticky bar of this page), so the page sets `--sx-sticky-top: 6rem` for the table heads there; a
 * single-division league has no bar and keeps the root offset.
 *
 * Last: the league-specific caveats that a reader of the table needs (uneven games played, whose
 * order it is where the league publishes none, a membership note), then one row of links: how
 * standings are calculated (/about), the playoffs, the JV standings, last season, and the league's
 * own sites. The method itself is on /about.
 *
 * The LA independents (DESIGN §24.10) get the same page as a league: their table counts their
 * games against each other. The title names the group ('Independents standings'), since its short
 * name is an adjective.
 *
 * Static: `generateStaticParams` from `getLeagueIds()` with `dynamicParams = false`, no
 * search params, nothing derived from `Date.now()`. Following this URL never writes the
 * remembered league (the league row is in link mode).
 */
export const dynamicParams = false;

export function generateStaticParams(): { league: string }[] {
  return getLeagueIds().map((league) => ({ league }));
}

export async function generateMetadata({ params }: PageProps<'/standings/[league]'>): Promise<Metadata> {
  const { league } = await params;
  const summary = getLeagueSummary(league);
  if (!summary) return { title: 'League not found' };
  const { leaders, views } = buildStandingsPageView(league);
  const through = views
    .map((v) => v.throughDate)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);
  // The <title> names the sport, the page's h1 (standingsLabel) does not need to: a search result
  // has only the title to say this is field hockey, and "SCVAL standings" alone could be any sport.
  const title = `${summary.shortName} ${SPORT.noun} standings`;
  // A 'site' league publishes no points rule (the Sunset, the San Diego leagues): the points are this site's.
  const site = getLeague(summary.id).rules.orderScope === 'site';
  const description = `${leagueSportWords(summary.id)} standings, ordered on ${orderedOnWords(getLeague(summary.id), site)}. ${leaderClause(leaders)}.${
    through ? ` League games through ${shortDate(through)}.` : ''
  } Computed from published results; unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/standings/${summary.id}` },
    openGraph: { ...OG_BASE, title, description, url: `/standings/${summary.id}` },
  };
}

/** The rail lists at most this many games of the league's next game day. */
const RAIL_GAMES = 5;

export default async function LeagueStandingsPage({ params }: PageProps<'/standings/[league]'>) {
  const { league } = await params;
  const summary = getLeagueSummary(league);
  if (!summary) notFound();
  const data = buildStandingsPageView(summary.id);
  const multi = summary.divisions.length > 1;
  const tabs = data.views.map((view) => ({ href: `#${view.division}`, label: view.kicker }));

  // The league's next game day: every game on the first date that has one, in start-time order.
  const upcoming = getUpcoming(Number.MAX_SAFE_INTEGER, { league: summary.id });
  const nextDate = upcoming[0]?.dateKey ?? null;
  const nextGames = upcoming.filter((game) => game.dateKey === nextDate);

  // A league that publishes no standings, or no points rule: whose order this is, in one line.
  const ownOrder = getLeague(summary.id).rules.orderScope !== 'table' ? (data.views[0]?.rankRule ?? null) : null;
  const caveats = [...data.unevenGp, ownOrder, data.membershipNote].filter((line): line is string => Boolean(line));
  const playoffs = data.views[0]?.playoffsHref ?? null;

  const tables = data.views.map((view, index) => (
    <DivisionStandings key={view.division} view={view} showHealth={index === 0} first={index === 0 && !data.notice} />
  ));

  return (
    /* Multi-division: the sticky table heads park under the 48px top bar plus the 48px division
       bar on phone (6rem); from md there is no division bar. Single-division: no bar, so the root
       offset stands. */
    <div
      className={
        multi
          ? 'pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]'
          : 'pb-section-lg'
      }
    >
      <PageHeader title={standingsLabel(summary.id)} />

      {/* The page league's region only, plus All → the index (DESIGN-socal §2.4). */}
      <ScopeBar
        region={false}
        league={{
          mode: 'link',
          includeAll: true,
          label: 'Leagues',
          leagues: leagueChips(summary.region),
          current: summary.id,
          hrefs: leagueHrefs('/standings', summary.region),
        }}
        stamp={<LastUpdated at={data.asOf} now={BUILD_INSTANT} variant="time" />}
      />

      {multi ? <DivisionTabs variant="bar" tabs={tabs} /> : null}

      {data.notice ? (
        <div className="sx-inset mt-5 max-w-prose">
          <p className="m-0 font-semibold text-ink">{data.notice.heading}</p>
          <p className="mb-0">{data.notice.body}</p>
        </div>
      ) : null}

      {nextDate ? (
        // `sx-cols` is two columns from 768; this page keeps one until 1024, where the table has room.
        <div className="sx-cols max-lg:block">
          <div className="min-w-0">{tables}</div>
          <aside className="sx-rail" aria-labelledby="next-games">
            <section className="sx-section max-lg:mt-10">
              <h2 id="next-games">Next games</h2>
              <div className="sx-strip">
                <h3 className="m-0 text-lead text-ink">
                  <Link
                    href={nextDate === getToday() ? '/' : `/scores/${nextDate}`}
                    prefetch={false}
                    // A 36px target with a mouse, 44px on touch (the strip grows with it).
                    className="inline-flex min-h-9 items-center pointer-coarse:min-h-11"
                  >
                    {longDate(nextDate)}
                  </Link>
                </h3>
                <div className="sx-strip-end">
                  <span>{plural(nextGames.length, 'game')}</span>
                </div>
              </div>
              <GameList games={nextGames.slice(0, RAIL_GAMES)} showChips />
              <ul className="sx-linkrow">
                <li>
                  <Link href={`/schedule/${summary.id}`} prefetch={false} className="sx-action">
                    {summary.shortName} schedule
                  </Link>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      ) : (
        tables
      )}

      <div className="mt-10">
        {caveats.map((line) => (
          <p key={line} className="sx-note">
            {line}
          </p>
        ))}
        <ul className="sx-linkrow">
          <li>
            <Link href="/about#standings" prefetch={false} className="sx-action">
              How standings are calculated
            </Link>
          </li>
          {playoffs ? (
            <li>
              <Link href={playoffs} prefetch={false} className="sx-action">
                Playoffs
              </Link>
            </li>
          ) : null}
          <li>
            <Link href={`/jv#${summary.id}`} prefetch={false} className="sx-action">
              {summary.shortName} JV standings
            </Link>
          </li>
          {/* Only a league with published 2025-26 standings (`hasHistory` decides) has a finished
              season to compare with (SPEC §8.1). */}
          {hasHistory(summary.id) ? (
            <li>
              <Link href={`/history/2025-26#${summary.id}`} prefetch={false} className="sx-action">
                2025-26 final standings
              </Link>
            </li>
          ) : null}
          {summary.links.map((link) => (
            <li key={link.href}>
              {/* A league document's name can be longer than a phone is wide: let it wrap. */}
              <ExternalLink href={link.href} className="sx-action whitespace-normal">
                {link.label}
              </ExternalLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
