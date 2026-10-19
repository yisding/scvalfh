import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import LeagueSwitcher from '@/components/layout/LeagueSwitcher';
import PageHeader from '@/components/layout/PageHeader';
import DivisionStandings from '@/components/standings/DivisionStandings';
import DivisionTabs from '@/components/standings/DivisionTabs';
import Arrow from '@/components/ui/Arrow';
import ExternalLink from '@/components/ui/ExternalLink';
import { getLeague } from '@/lib/config/leagues';
import { leagueSportWords, standingsLabel } from '@/lib/config/leagues/labels';
import { hasHistory } from '@/lib/datasets/history';
import { shortDate } from '@/lib/format/dates';
import { leagueChips, leagueHrefs } from '@/views/site/league-chips';
import { leagueParam, leagueStaticParams } from '@/views/site/league-route';
import { missingMetadata, pageMetadata } from '@/views/site/page-metadata';
import { leaderClause } from '@/views/standings/leader-lines';
import { buildStandingsPageView } from '@/views/standings/standings-view';

/**
 * /standings/<league> — "Where do WE stand?" (SPEC §8.1, §10.3): one league's full tables.
 *
 * Every division of the league lives on ONE page with a `#<division>` anchor each
 * (`/standings/scval#de-anza`, `/standings/bval#santa-teresa`); a single-division league has its
 * one table under `id=<division>` and no division picker or label. A league whose schools are not all
 * in its section (the EAL) prints its membership note under the header. The page's job is comparison,
 * and anchors work with JavaScript off and are shareable (DESIGN §1.2).
 *
 * Multi-division leagues keep today's sticky division bar under the 48px top bar, so the page sets
 * `--sx-sticky-top: 6rem` for the table heads; a single-division league has no bar and keeps the
 * root offset (no 48px gap under the top bar).
 *
 * The league's JV tables are on /jv (`/jv#<league>`), linked from the pills at the foot; this page
 * carries the varsity tables only.
 *
 * The LA independents (DESIGN §24.10) get the same page as a league: their table counts their
 * games against each other, and its notes carry the group's own sentence (`official.note`). The title names the
 * group ('Independents standings'), since its short name is an adjective.
 *
 * Static: `generateStaticParams` from `leagueStaticParams` (`LEAGUE_IDS`) with `dynamicParams = false`, no
 * search params, nothing derived from `Date.now()`. Following this URL never writes the
 * remembered league (the switcher is in link mode).
 */
export const dynamicParams = false;

export function generateStaticParams(): { league: string }[] {
  return leagueStaticParams();
}

export async function generateMetadata({ params }: PageProps<'/standings/[league]'>): Promise<Metadata> {
  const { league } = await params;
  const summary = leagueParam(league);
  if (!summary) return missingMetadata('League not found');
  const { leaders, throughDate: through } = buildStandingsPageView(league);
  // The <title> names the sport, the page's h1 (standingsLabel) does not need to: a search result
  // has only the title to say this is field hockey, and "SCVAL standings" alone could be any sport.
  const title = `${summary.shortName} field hockey standings`;
  // A 'site' league publishes no points rule (the Sunset, the San Diego leagues): the points are this site's.
  const site = getLeague(summary.id).rules.orderScope === 'site';
  const description = `${leagueSportWords(summary.id)} standings, ordered on ${site ? 'this site’s ' : ''}points (3 a win, 1 a tie). ${leaderClause(leaders)}.${
    through ? ` League games through ${shortDate(through)}.` : ''
  } Computed from published results; unofficial.`;
  return pageMetadata({
    path: `/standings/${summary.id}`,
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    card: 'own',
  });
}

export default async function LeagueStandingsPage({ params }: PageProps<'/standings/[league]'>) {
  const { league } = await params;
  const summary = leagueParam(league);
  if (!summary) notFound();
  const data = buildStandingsPageView(summary.id);
  const multi = summary.divisions.length > 1;
  const tabs = data.views.map((view) => ({ href: `#${view.division}`, label: view.kicker }));

  return (
    /* Multi-division: the sticky table heads park under the 48px top bar plus the 48px division
       bar on phone (6rem); from md the division pills sit in the title row and do not stick.
       Single-division: no bar, so the root offset stands. */
    <div
      className={
        multi
          ? 'pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]'
          : 'pb-section-lg'
      }
    >
      <PageHeader
        title={standingsLabel(summary.id)}
        // The sport is named in the lede: the h1 ("SCVAL standings") is the league's short name only.
        description={`${leagueSportWords(summary.id)} · ${summary.section.name} · league games only`}
        aside={multi ? <DivisionTabs variant="inline" tabs={tabs} /> : undefined}
        asideClassName={multi ? 'hidden md:block' : undefined}
      />
      {/* Only where the league's schools are not all in its section (EAL: two Sac-Joaquin schools). */}
      {data.membershipNote ? (
        <p className="m-0 mt-2 max-w-prose text-meta text-ink-3">{data.membershipNote}</p>
      ) : null}

      {/* The page league's region only, plus All → the index (DESIGN-socal §2.4). */}
      <LeagueSwitcher
        mode="link"
        includeAll
        label="Leagues"
        leagues={leagueChips(summary.region)}
        current={summary.id}
        hrefs={leagueHrefs('/standings', summary.region)}
        className="mt-4"
      />

      {multi ? <DivisionTabs variant="bar" tabs={tabs} className="mt-4" /> : null}

      {data.notice ? (
        <div className="sx-inset mt-6 max-w-prose">
          <p className="m-0 text-body font-semibold text-ink">{data.notice.heading}</p>
          <p className="mb-0">{data.notice.body}</p>
        </div>
      ) : null}

      {data.views.map((view, index) => (
        <DivisionStandings
          key={view.division}
          view={view}
          health={index === 0 ? data.health : undefined}
          className={index === 0 && !data.notice ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
        />
      ))}

      <div className="mt-section flex max-w-prose flex-col gap-2 text-meta text-ink-2 md:mt-section-lg">
        <p className="m-0">
          {data.rules}{' '}
          <Link
            href={`/about#rules-${summary.id}`}
            prefetch={false}
            className="font-medium text-accent hover:underline"
          >
            How standings are computed <Arrow />
          </Link>
        </p>
        {data.unevenGp.map((line) => (
          <p key={line} className="m-0">
            {line}
          </p>
        ))}
        {data.coLeaders.map((line) => (
          <p key={line} className="m-0">
            {line}
          </p>
        ))}
      </div>

      {/* The same shape as /schedule's key ("How to read this page"): `max-w-3xl` and a plain
          summary with no note count, so the site's how-to-read disclosures look like one
          component. The paragraphs inside keep the prose measure. */}
      <details className="sx-inset sx-disclosure mt-6 max-w-3xl">
        <summary>How to read these tables</summary>
        {data.legend.map((note) => (
          <p key={note} className="mb-0 max-w-prose">
            {note}
          </p>
        ))}
      </details>

      {/* The pills sit on the canvas, where the default surface-2 fill all but vanished in light:
          the surface plus a 1px ring makes them read as buttons, like the division pills. Only a
          league with published 2025-26 tables (SCVAL and BVAL; `hasHistory` decides) has a finished
          season to compare with (SPEC §8.1). */}
      <div className="mt-6 flex flex-wrap gap-2">
        {summary.links.map((link) => (
          <ExternalLink
            key={link.href}
            href={link.href}
            className="sx-pill sx-pill-ring"
          >
            {link.label}
          </ExternalLink>
        ))}
        <Link href={`/jv#${summary.id}`} prefetch={false} className="sx-pill sx-pill-ring">
          {summary.shortName} JV standings
        </Link>
        {hasHistory(summary.id) ? (
          <Link
            href={`/history/2025-26#${summary.id}`}
            prefetch={false}
            className="sx-pill sx-pill-ring"
          >
            Last season&rsquo;s final tables
          </Link>
        ) : null}
      </div>
    </div>
  );
}
