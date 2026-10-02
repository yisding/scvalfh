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
 * the next one — are answered first.
 *
 * Layout (modernization brief §5.7): the identity hero card, the stat tiles, then ONE grid whose
 * children stay in that DOM order — one column on a phone and at 768px, two from 1024px. Rows are
 * separated by space, never by a rule.
 *
 * At 1024px+ a strict pairing left 250–350px holes beside every tall section (Form beside Margin,
 * Who we haven't beaten beside the League game log). So the two tallest sections SPAN two rows
 * and the short ones stack beside them, still by plain auto-placement (no `dense`, no explicit
 * order), so reading order = DOM order = row-major visual order:
 *
 *     Last           | Next
 *     Form           | Margin (2 rows)
 *     Splits         |   ″
 *     CCS picture    | Who we haven't beaten
 *     League log (2) | Scheduled, not reported
 *        ″           | Non-league
 *     Elsewhere (both columns)
 *
 * The League log spans only when the "Scheduled, not reported" card exists and there are league
 * results. Without results (Wilcox) the log is a short empty state and the official-fixtures list
 * is the long one (14 rows), so a list of more than six fixtures takes BOTH columns instead of
 * leaving a ~600px hole beside it; the short Non-league card then sits under it.
 *
 * Wilcox gets this whole page with no results: identity, links, the CCS line, the official-schedule
 * fixtures and every empty state, because a team with no data still gets a complete, useful page
 * (DESIGN §8).
 */

/** All 16 prerendered; anything else is a 404 rather than a runtime render. */
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

  const leagueLogSpans = hasPlayedLeagueGames && officialFixtures.length > 0;
  const fixturesSpan = !leagueLogSpans && officialFixtures.length > 6;

  const maxprepsAction = team.external.maxprepsScheduleUrl
    ? { href: team.external.maxprepsScheduleUrl, label: 'Check MaxPreps', external: true }
    : undefined;

  return (
    <div className="pb-section-lg">
      <TeamIdentity view={view} knownSlugs={getTeamSlugs()} />

      <TeamStatTiles view={view} />

      <div className="mt-section grid gap-x-10 gap-y-section md:mt-section-lg lg:grid-cols-2 lg:gap-y-section-lg">
        {/* LAST and NEXT: the two questions a parent on the turf actually has. */}
        <section className="min-w-0">
          <SectionHeader
            kicker="Last"
            meta={
              last
                ? `${shortDate(last.dateLocal)} · ${last.isLeague ? 'League' : 'Non-league'}`
                : undefined
            }
          />
          {last ? (
            <div className="sx-card sx-flush sx-bleed">
              <GameRow game={last} perspective={team.slug} defaultExpanded showTime={false} />
            </div>
          ) : (
            <EmptyState heading={`No results reported for ${team.name}.`} action={maxprepsAction}>
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

        {/* A team with no reported results gets ONE empty state here, not an empty form strip
            beside an empty chart (DESIGN §8). */}
        {hasPlayedLeagueGames ? (
          <>
            <section className="min-w-0">
              <SectionHeader kicker="Form" meta="League, oldest to newest" />
              {/* 24px chips fill more of their 40px tap boxes, so the five read as one sequence;
                  the direction is in the heading's meta, and the non-league count gets its own
                  line instead of trailing off the end of the strip. */}
              <div className="sx-card p-4 md:p-5">
                <div className="flex min-h-11 items-center">
                  <FormStrip
                    entries={formEntries}
                    size={24}
                    label={`${team.name} last ${formEntries.length} league games`}
                  />
                </div>
                {nonLeagueLog.length > 0 ? (
                  <p className="mt-2 mb-0 text-meta text-ink-3">
                    {`+ ${nonLeagueLog.length} non-league ${nonLeagueLog.length === 1 ? 'game' : 'games'}, not counted here`}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="min-w-0 lg:row-span-2">
              <SectionHeader kicker="Margin by league game" meta={`${leaguePlayed} played`} />
              <div className="sx-card p-4 md:p-5">
                <MarginStrip
                  entries={marginEntries}
                  teamName={team.name}
                  className="hidden md:block"
                  height={200}
                />
                <MarginStrip
                  entries={marginEntries}
                  teamName={team.name}
                  className="md:hidden"
                  height={160}
                />
              </div>
            </section>
          </>
        ) : (
          <section className="min-w-0 lg:col-span-2">
            <SectionHeader kicker="Form and goal margin" />
            <EmptyState
              heading={`No league results reported for ${team.name}.`}
              action={maxprepsAction}
            >
              Their schedule is below, and MaxPreps may have results we have not picked up yet. We
              do not fill the gap with zeroes.
            </EmptyState>
          </section>
        )}

        <section className="min-w-0">
          <SectionHeader kicker="Splits" />
          <TeamSplits view={view} />
        </section>

        <section className="min-w-0">
          <SectionHeader kicker="CCS picture" meta="Not official" />
          <TeamPlayoffLine view={view} />
        </section>

        <section className="min-w-0">
          <SectionHeader
            kicker="Who we haven't beaten"
            meta={`${DIVISION_LABELS[team.division]} only`}
          />
          <TeamUnbeaten view={view} />
        </section>

        <section
          className={leagueLogSpans ? 'min-w-0 lg:row-span-2' : 'min-w-0'}
        >
          <SectionHeader
            kicker="League game log"
            meta={`${leaguePlayed} of ${leagueScheduled}`}
            action={{ href: `/standings#${team.division}`, label: 'Standings' }}
          />
          <TeamGameLog
            games={leagueLog}
            perspective={team.slug}
            emptyHeading={`No league games are published for ${team.name}.`}
            emptyBody={`The official ${DIVISION_LABELS[team.division]} schedule has ${leagueScheduled} division games for them; none of those fixtures has a contest in any data source.`}
          />
        </section>

        {officialFixtures.length > 0 ? (
          <section className={fixturesSpan ? 'min-w-0 lg:col-span-2' : 'min-w-0'}>
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

        <section className="min-w-0">
          <SectionHeader kicker="Non-league" meta={`${nonLeagueLog.length} games`} />
          <TeamGameLog
            games={nonLeagueLog}
            perspective={team.slug}
            emptyHeading={`${team.name} has no non-league games this season.`}
            emptyBody="Every game on their schedule counts toward the division record."
          />
        </section>

        <section className="min-w-0 lg:col-span-2">
          <SectionHeader kicker="Elsewhere" />
          {/* Pills (40px), not bare text links: three standalone links stacked at text height were
              17px tall and 21px apart, which axe reported as a serious WCAG 2.5.8 failure on
              /teams/st-ignatius. A link inside a sentence stays as it is; these are not. */}
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {team.external.maxprepsTeamUrl ? (
              <li>
                <ExternalLink href={team.external.maxprepsTeamUrl} className="sx-pill">
                  MaxPreps: {team.name} field hockey
                </ExternalLink>
              </li>
            ) : null}
            {team.external.maxprepsScheduleUrl ? (
              <li>
                <ExternalLink href={team.external.maxprepsScheduleUrl} className="sx-pill">
                  MaxPreps schedule &amp; scores
                </ExternalLink>
              </li>
            ) : null}
            {sblive ? (
              <li>
                <ExternalLink href={sblive} className="sx-pill">
                  SBLive / SI: {team.name}
                </ExternalLink>
              </li>
            ) : null}
          </ul>
          <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
            Records here are computed from published game results as of{' '}
            {formatStamp(getFetchedAt())} and may differ from the official standings. School colors
            are taken from the source and used only in the monogram; no image is ever requested
            from another site.
          </p>
        </section>
      </div>
    </div>
  );
}
