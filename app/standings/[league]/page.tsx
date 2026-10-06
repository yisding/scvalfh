import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import LeagueSwitcher from '../../../components/layout/LeagueSwitcher';
import PageHeader from '../../../components/layout/PageHeader';
import { leagueChips, leagueHrefs } from '../../../components/layout/league-chips';
import { OG_BASE } from '../../../components/layout/site';
import DivisionStandings from '../../../components/standings/DivisionStandings';
import DivisionTabs from '../../../components/standings/DivisionTabs';
import IndependentGroup from '../../../components/standings/IndependentGroup';
import { buildStandingsPageView } from '../../../components/standings/standings-page-view';
import { leaderClause } from '../../../components/standings/standings-view';
import Arrow from '../../../components/ui/Arrow';
import ExternalLink from '../../../components/ui/ExternalLink';
import { biggestGoalDiff } from '../../../components/ui/StandingsTable';
import { getLeagueIds, getLeagueSummary } from '../../../lib/data';
import { shortDate } from '../../../lib/format';
import { hasHistory } from '../../../lib/history';
import { getLeague, isIndependentLeague } from '../../../lib/leagues';
import SectionHeader from '../../../components/ui/SectionHeader';

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
 * A group with no league table (the Southern Section independents, DESIGN §24.9) gets the same URL and the
 * same chips, but no table, legend, rules line or "league games only": its header names the group, and the
 * page says why there is no table (the group's note), links its teams and says what its postseason is.
 *
 * Static: `generateStaticParams` from `getLeagueIds()` with `dynamicParams = false`, no
 * search params, nothing derived from `Date.now()`. Following this URL never writes the
 * remembered league (the switcher is in link mode).
 */
export const dynamicParams = false;

export function generateStaticParams(): { league: string }[] {
  return getLeagueIds().map((league) => ({ league }));
}

export async function generateMetadata({ params }: PageProps<'/standings/[league]'>): Promise<Metadata> {
  const { league } = await params;
  const summary = getLeagueSummary(league);
  if (!summary) return { title: 'League not found' };
  if (isIndependentLeague(summary.id)) {
    // No table, so no leaders and no "ordered on points": the group's own sentence says what there is.
    const title = summary.name;
    const view = buildStandingsPageView(league).views[0];
    const description = view?.independent?.note ?? `${summary.name}: no league games, so no table.`;
    return {
      title,
      description,
      alternates: { canonical: `/standings/${summary.id}` },
      openGraph: { ...OG_BASE, title, description, url: `/standings/${summary.id}` },
    };
  }
  const { leaders, views } = buildStandingsPageView(league);
  const through = views
    .map((v) => v.throughDate)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);
  const title = `${summary.shortName} standings`;
  // A 'site' league publishes no points rule (the Sunset, the San Diego leagues): the points are this site's.
  const site = getLeague(summary.id).rules.orderScope === 'site';
  const description = `${summary.name}, ordered on ${site ? 'this site’s ' : ''}points (3 a win, 1 a tie). ${leaderClause(leaders)}.${
    through ? ` League games through ${shortDate(through)}.` : ''
  } Computed from published results; unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/standings/${summary.id}` },
    openGraph: { ...OG_BASE, title, description, url: `/standings/${summary.id}` },
  };
}

export default async function LeagueStandingsPage({ params }: PageProps<'/standings/[league]'>) {
  const { league } = await params;
  const summary = getLeagueSummary(league);
  if (!summary) notFound();
  const data = buildStandingsPageView(summary.id);
  if (isIndependentLeague(summary.id)) return <IndependentStandings data={data} />;
  const multi = summary.divisions.length > 1;
  const tabs = data.views.map((view) => ({ href: `#${view.division}`, label: view.kicker }));

  // The page disclosure: the GD paragraph and each generic per-division sentence once. The GD
  // scale is in words ("De Anza's is 36"), not "|GD| max 36"; a single-division league names no
  // division (SPEC §10.3).
  // A division where every |GD| is 0 (Metro South Bay before its first game) is left out of the
  // list: its `gdDomain` is the bar floor of 1, not a goal difference (StandingsTable biggestGoalDiff).
  const scaled = data.views.filter((v) => biggestGoalDiff(v.rows.map((r) => r.standing.computed.gd)) > 0);
  const gdScale = multi
    ? `Bars are scaled to each division's own biggest goal difference${
        scaled.length > 0 ? ` (${scaled.map((v) => `${v.label}'s is ${v.gdDomain}`).join(', ')})` : ''
      }, so bars in different divisions are not comparable.`
    : `Bars are scaled to the league's biggest goal difference${
        scaled.length > 0 ? ` (${scaled[0]!.gdDomain})` : ''
      }.`;
  const legend = [
    `GD = league goals for minus goals against. ${gdScale} A real 0 shows as 0; a score we do not have shows as an em dash. Forfeits count in the win-loss-tie record, not in the goal columns.`,
    // A league with no fixed schedule (the Sunset, gamesPerTeam null) has no "of N", LEFT or MAX.
    data.views.every((view) => view.fixedSchedule)
      ? 'GP is league games counted of those scheduled. LEFT is league games with no counted result yet — still to play, or played and not reported. MAX is the most points a team could reach if it won all of them: a ceiling, not a projection.'
      : `GP is league games counted. ${summary.shortName} has no fixed league schedule, so there is no LEFT or MAX column.`,
    ...new Set(data.views.flatMap((view) => view.legendNotes)),
  ];

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
        title={`${summary.shortName} standings`}
        description={`${summary.name} · ${summary.section.name} · league games only`}
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
          showHealth={index === 0}
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
        {legend.map((note) => (
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

/**
 * /standings/<group> for a group with no league table (the Southern Section independents): the header names
 * the group, the section's one block says why there is no table and links each team, and the postseason card
 * is the section's no-postseason note with its source. Nothing here is a place, a point or a league game.
 */
function IndependentStandings({ data }: { data: ReturnType<typeof buildStandingsPageView> }) {
  const { league: summary } = data;
  const view = data.views[0];
  return (
    <div className="pb-section-lg">
      <PageHeader title={summary.name} description={`${summary.section.name} · no league games, so no table`} />

      <LeagueSwitcher
        mode="link"
        includeAll
        label="Leagues"
        leagues={leagueChips(summary.region)}
        current={summary.id}
        hrefs={leagueHrefs('/standings', summary.region)}
        className="mt-4"
      />

      {view ? (
        <section id={view.division} aria-labelledby={`${view.division}-heading`} className="mt-8 md:mt-10">
          <SectionHeader id={`${view.division}-heading`} kicker="No league table" />
          {view.independent ? <IndependentGroup group={view.independent} /> : null}
          {view.noPostseason ? (
            <div className="sx-card mt-6 flex flex-col p-5 md:p-6">
              <h3 className="m-0 text-lead text-ink">{view.statusHeading}</h3>
              <p className="mt-2 mb-0 max-w-prose text-meta text-ink-2">{view.noPostseason.note}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-4">
                <ExternalLink href={view.noPostseason.sourceUrl} className="sx-action gap-1 text-meta font-medium">
                  {view.noPostseason.sourceLabel}
                </ExternalLink>
                <Link
                  href={view.playoffsHref}
                  prefetch={false}
                  className="sx-action text-meta font-medium text-accent hover:underline"
                >
                  {view.playoffsLinkText}
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {summary.links.map((link) => (
          <ExternalLink key={link.href} href={link.href} className="sx-pill sx-pill-ring">
            {link.label}
          </ExternalLink>
        ))}
        <Link href={`/schedule/${summary.id}`} prefetch={false} className="sx-pill sx-pill-ring">
          Every game involving {isIndependentLeague(summary.id) ? 'the independents' : <>{summary.shortName} teams</>}
        </Link>
      </div>
    </div>
  );
}
