import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import TeamGameLog from '@/components/teams/TeamGameLog';
import TeamIdentity from '@/components/teams/TeamIdentity';
import TeamNextGame from '@/components/teams/TeamNextGame';
import TeamOfficialFixtures from '@/components/teams/TeamOfficialFixtures';
import TeamPlayoffLine from '@/components/teams/TeamPlayoffLine';
import TeamSplits from '@/components/teams/TeamSplits';
import TeamStatTiles from '@/components/teams/TeamStatTiles';
import TeamUnbeaten from '@/components/teams/TeamUnbeaten';
import { buildTeamPageView, nextOfficialFixture } from '@/components/teams/team-view';
import EmptyState from '@/components/ui/EmptyState';
import ExternalLink from '@/components/ui/ExternalLink';
import FormStrip from '@/components/ui/FormStrip';
import GameRow from '@/components/ui/GameRow';
import MarginStrip from '@/components/ui/MarginStrip';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE } from '@/components/layout/site-url';
import { getFetchedAt, getTeamSlugs } from '@/lib/data';
import { formatStamp, recordString, shortDate } from '@/lib/format';
import { DIVISION_LABELS } from '@/lib/season';

/**
 * /teams/[slug] — "How is MY team doing?" (DESIGN §3.7).
 *
 * Sixteen static pages, one per member of the official SCVAL alignment. Source order is the phone
 * order of the §3.7 wireframe, so the DOM order matches the visual order at every breakpoint
 * (DESIGN §10.5) and the parent's three questions — where do we stand, what just happened, when is
 * the next one — are all answered above the fold.
 *
 * Wilcox gets this whole page with no results: identity, links, the CCS line, the official-schedule
 * fixtures and every empty state, because a team with no data still gets a complete, useful page
 * (DESIGN §8).
 */

/** All 16 prerendered; anything else is a 404 rather than a runtime render. */
/**
 * The row lists are capped at a 46rem measure on desktop. DESIGN §3.7 puts NEXT / LAST / FORM /
 * SPLITS / WHO WE HAVEN'T BEATEN in a 2fr right rail beside a 3fr column; this page is one column
 * with two paired blocks instead, and a game-log row running the full 1120px put "vs Los Altos"
 * and its "FINAL" about 850px apart — the width the eye has to bridge to read one row.
 */
const LIST = 'mt-5 md:max-w-[46rem]';

export const dynamicParams = false;

export function generateStaticParams() {
  return getTeamSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<'/teams/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const view = buildTeamPageView(slug);
  if (!view) return { title: 'Team not found' };
  const { team, standing, hasResults } = view;
  const record =
    hasResults && standing
      ? `${recordString(standing.computed)} in ${view.divisionLabel} (${standing.computed.pts} pts)`
      : `${view.divisionLabel} division — no results reported`;
  return {
    title: `${team.name} field hockey`,
    description: `${team.name} ${team.mascot} girls varsity field hockey: ${record}. Schedule, results, goal margins and CCS picture. Unofficial, rebuilt nightly from MaxPreps.`,
    alternates: { canonical: `/teams/${team.slug}` },
    openGraph: {
      ...OG_BASE,
      title: `${team.name} — ${record}`,
      description: `Scores, schedule and standings for ${team.name} girls varsity field hockey.`,
      url: `/teams/${team.slug}`,
    },
  };
}

export default async function TeamPage({ params }: PageProps<'/teams/[slug]'>) {
  const { slug } = await params;
  const view = buildTeamPageView(slug);
  if (!view) notFound();

  const {
    team,
    last,
    next,
    leagueLog,
    nonLeagueLog,
    marginEntries,
    formEntries,
    officialFixtures,
    leaguePlayed,
    leagueScheduled,
  } = view;
  const sblive = team.external.sbliveGamesUrl;
  const hasPlayedLeagueGames = marginEntries.some(
    (entry) => entry.margin !== null && !entry.excludedFromMargin,
  );

  return (
    <div className="pb-6">
      <TeamIdentity view={view} knownSlugs={getTeamSlugs()} />

      <TeamStatTiles view={view} />

      {/* LAST and NEXT: the two questions a parent on the turf actually has. */}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <SectionHeader
            kicker="Last"
            meta={
              last
                ? `${shortDate(last.dateLocal)} · ${last.isLeague ? 'League' : 'Non-league'}`
                : undefined
            }
          />
          {last ? (
            <div className="sx-bleed border-y border-hairline bg-surface md:border">
              <GameRow game={last} perspective={team.slug} defaultExpanded showTime={false} />
            </div>
          ) : (
            <EmptyState
              heading={`No results reported for ${team.name}.`}
              action={
                team.external.maxprepsScheduleUrl
                  ? {
                      href: team.external.maxprepsScheduleUrl,
                      label: 'Check MaxPreps',
                      external: true,
                    }
                  : undefined
              }
            >
              Their schedule is below, and MaxPreps may have results we have not picked up yet.
            </EmptyState>
          )}
        </section>

        <TeamNextGame
          game={next}
          perspective={team.slug}
          teamName={team.name}
          nextOfficial={nextOfficialFixture(officialFixtures, view.today)}
        />
      </div>

      {/* A team with no reported results gets ONE empty state here, not an empty form strip
          beside an empty chart (DESIGN §8). */}
      {hasPlayedLeagueGames ? (
        <>
          <section className={LIST}>
            <SectionHeader kicker="Form" meta="League, oldest to newest" />
            <div className="flex min-h-11 items-center">
              <FormStrip
                entries={formEntries}
                label={`${team.name} last ${formEntries.length} league games`}
                showDirection
                nonLeagueCount={nonLeagueLog.length || undefined}
              />
            </div>
          </section>

          <section className="mt-5">
            <SectionHeader kicker="Margin by league game" meta={`${leaguePlayed} played`} />
            <MarginStrip
              entries={marginEntries}
              teamName={team.name}
              className="hidden md:block"
              height={200}
            />
            <MarginStrip entries={marginEntries} teamName={team.name} className="md:hidden" />
          </section>
        </>
      ) : (
        <section className="mt-5">
          <SectionHeader kicker="Form and goal margin" />
          <EmptyState
            heading={`No league results reported for ${team.name}.`}
            action={
              team.external.maxprepsScheduleUrl
                ? {
                    href: team.external.maxprepsScheduleUrl,
                    label: 'Check MaxPreps',
                    external: true,
                  }
                : undefined
            }
          >
            Their schedule is below, and MaxPreps may have results we have not picked up yet. We do
            not fill the gap with zeroes.
          </EmptyState>
        </section>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <SectionHeader kicker="Splits" />
          <TeamSplits view={view} />
        </section>
        <section>
          <SectionHeader kicker="CCS picture" meta="Not official" />
          <TeamPlayoffLine view={view} />
        </section>
      </div>

      <section className={LIST}>
        <SectionHeader
          kicker="Who we haven't beaten"
          meta={`${DIVISION_LABELS[team.division]} only`}
        />
        <TeamUnbeaten view={view} />
      </section>

      <section className={LIST}>
        <SectionHeader
          kicker="League game log"
          meta={`${leaguePlayed} of ${leagueScheduled}`}
          action={{ href: `/standings#${team.division}`, label: 'standings' }}
        />
        <TeamGameLog
          games={leagueLog}
          perspective={team.slug}
          emptyHeading={`No league games are published for ${team.name}.`}
          emptyBody={`The official ${DIVISION_LABELS[team.division]} schedule has ${leagueScheduled} division games for them; none of those fixtures has a contest in any data source.`}
        />
      </section>

      {officialFixtures.length > 0 ? (
        <section className={LIST}>
          <SectionHeader
            kicker="Scheduled, not reported"
            meta={`${officialFixtures.length} fixture${officialFixtures.length === 1 ? '' : 's'}`}
          />
          <TeamOfficialFixtures
            fixtures={officialFixtures}
            slug={team.slug}
            division={team.division}
          />
        </section>
      ) : null}

      <section className={LIST}>
        <SectionHeader kicker="Non-league" meta={`${nonLeagueLog.length} games`} />
        <TeamGameLog
          games={nonLeagueLog}
          perspective={team.slug}
          emptyHeading={`${team.name} has no non-league games this season.`}
          emptyBody="Every game on their schedule counts toward the division record."
        />
      </section>

      <section className="mt-5">
        <SectionHeader kicker="Elsewhere" />
        {/* `sx-action` on each one (24px box, WCAG 2.5.8). Three standalone links stacked with a
            4px gap are 17px tall and 21px apart, so neither the size rule nor the spacing
            exception was satisfied — axe reported it as serious on /teams/st-ignatius, where the
            middle link is narrower than both neighbours and the closest-neighbour distance really
            is that 21px pitch. A link inside a sentence stays as it is; these are not. */}
        <ul className="space-y-1 text-meta">
          {team.external.maxprepsTeamUrl ? (
            <li>
              <ExternalLink href={team.external.maxprepsTeamUrl} className="sx-action">
                MaxPreps: {team.name} field hockey
              </ExternalLink>
            </li>
          ) : null}
          {team.external.maxprepsScheduleUrl ? (
            <li>
              <ExternalLink href={team.external.maxprepsScheduleUrl} className="sx-action">
                MaxPreps schedule &amp; scores
              </ExternalLink>
            </li>
          ) : null}
          {sblive ? (
            <li>
              <ExternalLink href={sblive} className="sx-action">
                SBLive / SI: {team.name}
              </ExternalLink>
            </li>
          ) : null}
        </ul>
        <p className="mt-2 mb-0 max-w-[62ch] text-meta text-ink-3">
          Records here are computed from published game results as of {formatStamp(getFetchedAt())}{' '}
          and may differ from the official standings. School colors are taken from the source and
          used only in the monogram; no image is ever requested from another site.
        </p>
      </section>
    </div>
  );
}
