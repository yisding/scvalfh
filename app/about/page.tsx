import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';
import CrossCheckTable, { type CrossCheckGroup } from '@/components/about/CrossCheckTable';
import SbliveCrossCheckSummary from '@/components/about/SbliveCrossCheckSummary';
import EmptyState from '@/components/ui/EmptyState';
import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '@/components/layout/site-url';
import {
  areKeyDatesConfirmed,
  getAllStandings,
  getCcsCalendar,
  getCounts,
  getCrossCheck,
  getFetchedAt,
  getOfficialFixtures,
  getOfficialStandingsPdfUrl,
  getPlayoffs,
  getSbliveCrossCheck,
  getSources,
  getTeamBySlug,
} from '@/lib/data';
import { dateWithYear, formatStamp, longDate, timeOfDayPT } from '@/lib/format';
import { BYLAW_CITATIONS, PLAYOFF_KEY_DATES, SOURCE_LINKS } from '@/lib/season';
import type { SourceStatus } from '@/lib/types';

/**
 * `/about` (DESIGN §3.10, SPEC §6) — where the data comes from, how standings are computed
 * (verbatim from the by-laws), the published cross-check log, the update cadence, privacy and
 * the not-affiliated disclaimer. Every standings footnote and every stale-snapshot notice on the
 * rest of the site links to an anchor on this page; the anchors below are stable on purpose.
 */
export const metadata: Metadata = {
  title: 'About & sources',
  description:
    'Where this site’s scores and standings come from, how SCVAL standings/points/tiebreaks are computed, the published MaxPreps and SBLive cross-checks, update cadence and privacy.',
  alternates: { canonical: '/about' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, url: '/about' },
};

/**
 * A quoted by-law: a card with a straight 3px rule down its left edge. The rule is a pseudo-element
 * inset 16px from the top and bottom (the card's corner radius), so it stays straight; an inset
 * box-shadow would curve around the corners like a bracket.
 */
const QUOTE =
  "sx-card relative not-italic p-5 pl-6 text-body text-ink-2 before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-rule before:content-['']";

const TOC = [
  { id: 'sources', label: 'Data sources' },
  { id: 'standings', label: 'Standings, points & tiebreaks' },
  { id: 'conventions', label: 'How a score is shown' },
  { id: 'cross-check', label: 'Cross-check log' },
  { id: 'freshness', label: 'How often this updates' },
  { id: 'playoffs', label: 'CCS playoffs' },
  { id: 'privacy', label: 'Privacy & accessibility' },
  { id: 'contact', label: 'Corrections & contact' },
  { id: 'not-affiliated', label: 'Not affiliated' },
] as const;

function statusCounts(sources: readonly SourceStatus[]): Record<SourceStatus['status'], number> {
  const out: Record<SourceStatus['status'], number> = { ok: 0, stale: 0, error: 0, skipped: 0 };
  for (const s of sources) out[s.status] += 1;
  return out;
}

export default function AboutPage() {
  const counts = getCounts();
  const sources = getSources();
  const counted = statusCounts(sources);
  const erroring = sources.filter((s) => s.status === 'error');

  const allStandings = [...getAllStandings()['de-anza'], ...getAllStandings()['el-camino']];
  const crossCheckRows = getCrossCheck();
  const rowsBySlug = new Map<string, CrossCheckGroup['rows']>();
  for (const row of crossCheckRows) {
    rowsBySlug.set(row.slug, [...(rowsBySlug.get(row.slug) ?? []), row]);
  }
  const flaggedSlugs = new Set([
    ...rowsBySlug.keys(),
    ...allStandings.filter((s) => s.mismatch).map((s) => s.slug as string),
  ]);
  const crossCheckGroups: CrossCheckGroup[] = [];
  for (const slug of flaggedSlugs) {
    const team = getTeamBySlug(slug);
    if (!team) continue;
    const standing = allStandings.find((s) => s.slug === slug);
    crossCheckGroups.push({ team, rows: rowsBySlug.get(slug) ?? [], detail: standing?.mismatchDetail });
  }

  const sbliveCross = getSbliveCrossCheck();

  const officialFixtures = getOfficialFixtures();
  const wilcoxFixtures = officialFixtures.filter(
    (f) => f.awaySlug === 'wilcox' || f.homeSlug === 'wilcox',
  ).length;
  const otherFixtures = officialFixtures.length - wilcoxFixtures;

  const officialStandingsPdfUrl = getOfficialStandingsPdfUrl();

  const ccsCalendar = getCcsCalendar();
  const keyDatesConfirmed = areKeyDatesConfirmed();
  const playoffs = getPlayoffs();

  return (
    // Three grid children, placed explicitly, so ONE DOM order serves both breakpoints
    // (DESIGN §10.5): the title and lede, then the jump list, then the sections. On a phone the
    // reader meets the page before its table of contents; at `md` the list moves into the right
    // rail spanning both rows, which is the tall containing block its `sticky` needs.
    // The rail starts at `lg`, not `md`: at 768 it left a 424px column and squeezed the source
    // cards to ~205px. Below `lg` the "On this page" disclosure carries the jump list instead.
    <div className="pb-section-lg lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-x-10">
      <PageHeader
        className="lg:col-start-1 lg:row-start-1"
        title="About & sources"
        description="This is an unofficial, fan-built scoreboard for the 16 De Anza and El Camino girls varsity field hockey teams. Every number on it is either read from a public source and shown as-is, or computed from public game results by rules published below. Nothing is guessed, and every disagreement we find with a source is published rather than quietly resolved."
      />

      <details className="sx-inset sx-disclosure mt-8 lg:hidden">
        <summary>On this page</summary>
        <nav aria-label="On this page">
          <ul className="m-0 list-none p-0">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="sx-action min-h-11 text-meta text-ink-2 hover:text-accent hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </details>

      <nav
        aria-label="Sections on this page"
        className="hidden lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-10 lg:block lg:sticky lg:top-[5rem]"
      >
        <div className="sx-card p-4">
          <p className="m-0 text-micro font-medium text-ink-3">On this page</p>
          <ul className="m-0 mt-2 list-none p-0">
            {TOC.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="sx-action min-h-8 text-meta text-ink-2 hover:text-accent hover:underline"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="mt-8 md:mt-10 lg:col-start-1 lg:row-start-2">
        {/* ---------------------------------------------------------------- sources */}
        <section id="sources">
          <SectionHeader size="lg" kicker="Data sources" />
          <p className="sx-prose">
            This snapshot covers all {counts.teams} SCVAL teams and {counts.games} games (
            {counts.leagueGames} of them league games): {counts.finals} final,{' '}
            {counts.pending} not yet reported.
          </p>
          <dl className="m-0 mt-stack grid gap-4 md:grid-cols-2 md:items-start">
            <div className="sx-card p-5">
              <dt>
                <span className="block text-lead text-ink">MaxPreps</span>
                <span className="mt-0.5 block text-meta text-ink-3">Primary source</span>
              </dt>
              <dd className="m-0 mt-2 text-body text-ink-2">
                Team schedules, scores, league standings tables and school colors come from
                MaxPreps&rsquo; own public data feed, the same one that powers its team and league
                pages. We read it, never write to it, and never hotlink its mascot images &mdash;
                the feed carries a mascot picture URL for every school, and this site reads that
                field and discards it: each school is shown as a color monogram instead, built
                from the two colors the feed reports.
                <span className="mt-3 flex flex-wrap gap-2">
                  <ExternalLink href={SOURCE_LINKS.maxpreps} className="sx-pill">
                    MaxPreps field hockey
                  </ExternalLink>
                </span>
              </dd>
            </div>
            <div className="sx-card p-5">
              <dt>
                <span className="block text-lead text-ink">SBLive / SI</span>
                <span className="mt-0.5 block text-meta text-ink-3">Secondary &middot; cross-check only</span>
              </dt>
              <dd className="m-0 mt-2 text-body text-ink-2">
                Sports Illustrated&rsquo;s high-school stats site (formerly Scorebook
                Live/SBLive) publishes its own scoreboard. We use it for exactly one thing: to
                check whether it agrees with MaxPreps on final scores. It is never used for
                division membership, records or standings &mdash; its own league groupings for
                2026-27 do not match SCVAL&rsquo;s. See{' '}
                <a href="#cross-check" className="text-accent hover:underline">
                  the cross-check log
                </a>{' '}
                below.
                <span className="mt-3 flex flex-wrap gap-2">
                  <ExternalLink href={SOURCE_LINKS.sblive} className="sx-pill">
                    SBLive/SI field hockey
                  </ExternalLink>
                </span>
              </dd>
            </div>
            <div className="sx-card p-5">
              <dt>
                <span className="block text-lead text-ink">Official SCVAL PDFs</span>
                <span className="mt-0.5 block text-meta text-ink-3">The league itself</span>
              </dt>
              <dd className="m-0 mt-2 text-body text-ink-2">
                SCVAL publishes the actual by-laws and the two schedule grids as PDFs on
                scval.com. League membership (which 16 schools are in which division), the
                points/tiebreak rules quoted below, and every scheduled matchup come from these
                documents, not from MaxPreps. When MaxPreps has never published a result for a
                game that the official grid says was scheduled &mdash; today that is{' '}
                {officialFixtures.length} game{officialFixtures.length === 1 ? '' : 's'},{' '}
                {wilcoxFixtures} of them Wilcox&rsquo;s{otherFixtures > 0 ? ` and ${otherFixtures} involving other schools` : ''}{' '}
                &mdash; it is listed as scheduled per SCVAL rather than silently dropped.{' '}
                {officialStandingsPdfUrl === null ? (
                  <>SCVAL has not yet posted an official 2026-27 standings PDF; we check for one every run.</>
                ) : officialStandingsPdfUrl ? (
                  <>
                    SCVAL has posted a 2026-27 standings PDF:{' '}
                    <ExternalLink href={officialStandingsPdfUrl}>view it</ExternalLink>.
                  </>
                ) : (
                  <>We have not yet checked scval.com for a 2026-27 standings PDF.</>
                )}
                <span className="mt-3 flex flex-wrap gap-2">
                  <ExternalLink href={SOURCE_LINKS.scval} className="sx-pill">
                    SCVAL fall sports
                  </ExternalLink>
                  <ExternalLink href={SOURCE_LINKS.scvalBylaws} className="sx-pill">
                    By-laws PDF
                  </ExternalLink>
                  <ExternalLink href={SOURCE_LINKS.scvalDeAnzaSchedule} className="sx-pill">
                    De Anza grid
                  </ExternalLink>
                  <ExternalLink href={SOURCE_LINKS.scvalElCaminoSchedule} className="sx-pill">
                    El Camino grid
                  </ExternalLink>
                </span>
              </dd>
            </div>
            <div className="sx-card p-5">
              <dt>
                <span className="block text-lead text-ink">CIF-CCS</span>
                <span className="mt-0.5 block text-meta text-ink-3">Playoff dates &amp; format</span>
              </dt>
              <dd className="m-0 mt-2 text-body text-ink-2">
                The Central Coast Section publishes the playoff calendar and format. See{' '}
                <a href="#playoffs" className="text-accent hover:underline">
                  CCS playoffs
                </a>{' '}
                below.
                <span className="mt-3 flex flex-wrap gap-2">
                  <ExternalLink href={SOURCE_LINKS.ccs} className="sx-pill">
                    CCS field hockey
                  </ExternalLink>
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* ---------------------------------------------------------------- standings */}
        <section id="standings" className="mt-16">
          <SectionHeader size="lg" kicker="Standings, points &amp; tiebreaks" />
          <div className="sx-prose">
          <p>
            League membership is a list we maintain from the official SCVAL alignment, not
            whatever happens to appear in the MaxPreps feed that day. Today MaxPreps&rsquo; own De
            Anza standings table has 7 rows; Wilcox is the league&rsquo;s 8th member and has no
            games in MaxPreps&rsquo; feed at all. We still show all 8 De Anza teams, with Wilcox
            sorted last, every cell an em dash, and a note explaining why &mdash; never a
            fabricated 0-0-0 record.
          </p>
          <p>
            Everything else is computed from individual game results, then compared field by
            field against MaxPreps&rsquo; own published table (see{' '}
            <a href="#cross-check" className="text-accent hover:underline">
              the cross-check log
            </a>
            ). The rules themselves are quoted below, verbatim, from the SCVAL Field Hockey
            By-Laws 2026-27.
          </p>

          <h3>Points &amp; standings order</h3>
          <blockquote className={QUOTE}>
            &ldquo;A team shall be awarded 3 points for a win, 1 point for a tie. The division
            placement/standings will be the order of team points. The team with the greatest
            number of points will be declared the champion and higher in the standings. If there
            is a tie at the top both teams shall be declared division champions.&rdquo;{' '}
            <cite className="not-italic text-ink-3">&mdash; Article VI, Section 2</cite>
          </blockquote>
          <p>
            We implement that literally: <code>points = 3 &times; wins + 1 &times; ties</code>{' '}
            from league games only (Article VI, Section 1 &mdash; a double round robin, division
            games only counting to the division record), and the PTS column on every standings
            table is the actual ordering key, not a secondary stat.
          </p>

          <h3>If teams are tied on points</h3>
          <p>
            The by-laws set out one tiebreak chain, applied by &ldquo;working to bring one team
            out&rdquo; of the tied group and then restarting the whole chain for whoever is left:
          </p>
          <ol className="list-decimal">
            <li>Better head-to-head record among the tied teams ({BYLAW_CITATIONS.headToHead}).</li>
            <li>Greater number of wins in division play ({BYLAW_CITATIONS.divisionWins}).</li>
            <li>Least goals given up between the head-to-head tied teams ({BYLAW_CITATIONS.h2hGoalsAgainst}).</li>
            <li>Goal differential between the head-to-head tied teams ({BYLAW_CITATIONS.h2hGoalDiff}).</li>
            <li>
              A coin flip. This site cannot compute a coin flip, so teams that reach this step
              render as <b className="font-semibold text-ink">tied at the same place</b> (a
              shared &ldquo;6=&rdquo; instead of a 6th and a 7th), with a footnote citing this
              rule. ({BYLAW_CITATIONS.coinFlip})
            </li>
          </ol>
          <p className="text-meta text-ink-3">
            Our display order is not a league ruling &mdash; if SCVAL settles a coin flip we have
            no way to know, the official standings remain the source of truth.
          </p>

          <h3>Overtime</h3>
          <blockquote className={QUOTE}>
            &ldquo;Varsity: four 15-minute quarters. After a regulation tie (league AND
            non-league varsity games): ONE 7-minute sudden-victory period, 7-a-side. If still
            tied after that one period, the game ends in a tie (no shootout in league
            play).&rdquo; <cite className="not-italic text-ink-3">&mdash; Article IV</cite>
          </blockquote>
          <p>
            An overtime win counts as a full win, shown with an OT tag. Because league play never
            has a shootout, the shootout state our code supports never actually occurs this
            season &mdash; it exists only so the rendering code has somewhere correct to send a
            shootout if one is ever reported.
          </p>

          <h3>CCS qualification</h3>
          <p>
            {BYLAW_CITATIONS.qualifiers}. Full detail, dates and today&rsquo;s live picture are
            under{' '}
            <a href="#playoffs" className="text-accent hover:underline">
              CCS playoffs
            </a>{' '}
            below and on the{' '}
            <Link href="/playoffs" className="text-accent hover:underline">
              Playoffs
            </Link>{' '}
            page.
          </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- conventions */}
        <section id="conventions" className="mt-16">
          <SectionHeader size="lg" kicker="How a score is shown" />
          <div className="sx-prose">
          <p>
            One rule governs every score on this site: a game that has not been decided never
            shows as <span className="sx-num">0&ndash;0</span>. A real final score of 0-0 (it has
            happened this season) prints as <span className="sx-num">0</span> in full-strength
            ink; a game with nothing reported yet prints an em dash in muted ink, with a
            screen-reader label saying so. The two are never visually or semantically confused.
          </p>
          <ul className="list-disc">
            <li>A completed game shows <b className="font-semibold text-ink">FINAL</b> and the score; an overtime win adds an OT tag.</li>
            <li>
              A forfeit counts in win-loss-tie but not in goals for/against/differential &mdash;
              marked with a dagger everywhere a total would otherwise be misleading.
            </li>
            <li>A game with no score posted yet shows <b className="font-semibold text-ink">SCORE NOT REPORTED</b> with an empty outline chip, never a blank or a zero.</li>
            <li>
              A game MaxPreps marks as in progress shows <b className="font-semibold text-ink">LIVE</b>, but this is a scheduled-window label, not a running score &mdash; see{' '}
              <a href="#freshness" className="text-accent hover:underline">
                how often this updates
              </a>
              .
            </li>
            <li>A postponed game shows <b className="font-semibold text-ink">POSTPONED</b> with the new date when one is known, or &ldquo;TBD&rdquo; when it is not.</li>
            <li>A non-league game carries a small NL tag everywhere; it counts in a team&rsquo;s overall record and nowhere in the league standings.</li>
          </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- cross-check */}
        <section id="cross-check" className="mt-16">
          <SectionHeader size="lg" kicker="Cross-check log" />
          <p className="sx-prose">
            MaxPreps&rsquo; own standings feed already carries its computed record, points, goals
            and placement for every team, so checking our work is a direct comparison, not a
            reimplementation: for every team we compare our computed W-L-T, goals and place
            against MaxPreps&rsquo; published numbers, field by field. Every disagreement is
            published here and flagged with &#9873; on the standings row &mdash; we always show
            our own computation and say so, rather than silently picking a side.
          </p>
          <h3 className="mt-stack mb-3 text-lead text-ink">vs. MaxPreps&rsquo; standings table</h3>
          <CrossCheckTable groups={crossCheckGroups} />

          <h3 className="mt-section mb-3 text-lead text-ink">vs. SBLive/SI scores</h3>
          {sbliveCross ? (
            <SbliveCrossCheckSummary cross={sbliveCross} />
          ) : (
            <EmptyState heading="No SBLive comparison in the most recent run.">
              This step is optional and failure-tolerant; when it runs, every disagreement and
              every SBLive-only score appears here.
            </EmptyState>
          )}
        </section>

        {/* ---------------------------------------------------------------- freshness */}
        <section id="freshness" className="mt-16">
          <span id="updates" className="block" />
          <SectionHeader size="lg" kicker="How often this updates" />
          <div className="sx-prose">
          <p>
            This whole site is static: nothing here queries a live API when you load a page.
            Instead, an automated job re-fetches MaxPreps (and, on most runs, SBLive/SI and the
            SCVAL and CCS calendars) and rebuilds the site from scratch, roughly twice a day
            during the season &mdash; once overnight and once in the early morning, Pacific time
            &mdash; between August and November. A game that finishes at 7 PM Thursday typically
            appears on the site Friday morning, not that same night.
          </p>
          <p>
            <b className="font-semibold text-ink">Live scores are not collected.</b> A game
            MaxPreps marks as in progress is shown as a scheduled window with a{' '}
            <b className="font-semibold text-ink">LIVE</b> label, never a running score, because
            this site has no mechanism that watches a game while it is being played.
          </p>
          <p>
            The snapshot this page was built from was fetched {formatStamp(getFetchedAt())}. If a
            page anywhere on the site shows a &ldquo;last updated&rdquo; stamp more than 36 hours
            old, that is this site telling you its own nightly update may be failing &mdash; not
            a claim that nothing happened in the league since then.
          </p>
          <h3>Most recent run, by source</h3>
          <p className="text-meta text-ink-2">
            {counted.ok} source{counted.ok === 1 ? '' : 's'} ok &middot; {counted.stale} stale
            &middot; {counted.error} failed &middot; {counted.skipped} skipped (season-gated or
            optional steps, by design).
          </p>
          {erroring.length > 0 ? (
            <ul className="sx-list">
              {erroring.map((s) => (
                <li key={`${s.id}-${s.label}`} className="py-2 text-meta text-ink-2">
                  <b className="font-semibold text-loss-ink">{s.label}</b>
                  {s.error ? `: ${s.error}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-meta text-ink-3">
              No source failed outright in the most recent run.
            </p>
          )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- playoffs */}
        <section id="playoffs" className="mt-16">
          <SectionHeader size="lg" kicker="CCS playoffs" />
          <div className="sx-prose">
          <blockquote className={QUOTE}>
            &ldquo;16-team CCS tournament: SCVAL 7, BVAL 4, PCAL 2, at-large 3.&rdquo;{' '}
            <cite className="not-italic text-ink-3">&mdash; Article VII, Section 1</cite>
          </blockquote>
          <blockquote className={QUOTE}>
            &ldquo;The first three teams in each division are awarded automatic qualifiers (AQ)
            to CCS playoffs (ties broken by Article VI, Sections 2-7). Fourth place teams play a
            play-in game; the winner receives the SCVAL 7th AQ. The losing 4th-place team and
            both 5th-place teams are submitted to CCS for at-large consideration. #1 v #1, #2 v
            #2, #3 v #3 crossover games are played after the season to help CCS ordering (home
            site by coin flip). Per the official schedule PDFs these crossover/play-in games are
            Friday, October 30, 2026.&rdquo;{' '}
            <cite className="not-italic text-ink-3">&mdash; Article VII, Section 2</cite>
          </blockquote>
          <p>
            In practice: places 1&ndash;3 in each division qualify automatically, 4th place plays
            a crossover game on {longDate(PLAYOFF_KEY_DATES.crossover)} for the division&rsquo;s
            7th automatic berth, and both 5th-place teams go to the CCS committee for at-large
            consideration &mdash; along with the losing 4th-place team. A shared place changes
            who those teams are; see the standings footnotes. Live, team-by-team status is on the{' '}
            <Link href="/playoffs" className="text-accent hover:underline">
              Playoffs
            </Link>{' '}
            page.
          </p>
          <h3>Key dates</h3>
          <ul className="list-disc">
            <li>
              Entries due &amp; seeding meeting:{' '}
              <span className="sx-num">
                {dateWithYear(PLAYOFF_KEY_DATES.entriesDue)}, {timeOfDayPT(PLAYOFF_KEY_DATES.entriesDue)}
              </span>{' '}
              / <span className="sx-num">{timeOfDayPT(PLAYOFF_KEY_DATES.seedingMeeting)}</span>
            </li>
            <li>
              Quarterfinals:{' '}
              <span className="sx-num">{dateWithYear(PLAYOFF_KEY_DATES.quarterfinals)}</span>
            </li>
            <li>
              Semifinals: <span className="sx-num">{dateWithYear(PLAYOFF_KEY_DATES.semifinals)}</span>
            </li>
            <li>
              Final: <span className="sx-num">{dateWithYear(PLAYOFF_KEY_DATES.finals)}</span>
            </li>
            <li>
              Committee evaluation:{' '}
              <span className="sx-num">
                {dateWithYear(PLAYOFF_KEY_DATES.evaluationMeeting)}, {timeOfDayPT(PLAYOFF_KEY_DATES.evaluationMeeting)}
              </span>
            </li>
          </ul>
          <p className="text-meta text-ink-3">
            {ccsCalendar === undefined
              ? 'The CCS office also publishes a machine-readable calendar for these dates; this site starts polling it in late October and will note here whether it confirms the dates above.'
              : keyDatesConfirmed
                ? "The CCS office's own calendar confirms every date above."
                : "The CCS office's own calendar shows at least one difference from the dates above — check it directly."}{' '}
            <ExternalLink href={SOURCE_LINKS.ccsCalendar}>CCS calendar</ExternalLink>. Official
            bracket:{' '}
            {playoffs.bracketPublished ? (
              <ExternalLink href={playoffs.bracketUrl}>view it</ExternalLink>
            ) : (
              <>
                <ExternalLink href={playoffs.bracketUrl}>not yet published</ExternalLink>
              </>
            )}
            .
          </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- privacy / a11y */}
        <section id="a11y" className="mt-16">
          <span id="privacy" className="block" />
          <SectionHeader size="lg" kicker="Privacy &amp; accessibility" />
          <div className="sx-prose">
          <p>
            This site stores exactly two things, and both live only in your own browser:{' '}
            <b className="font-semibold text-ink">a theme choice</b> (system, light or dark) and{' '}
            <b className="font-semibold text-ink">a pinned team</b>, both in{' '}
            <code>localStorage</code>. Neither is ever sent anywhere &mdash; there are no
            accounts, no analytics, no tracking cookies and no third-party requests of any kind
            on any page. School colors come from data already in the snapshot, never a hotlinked
            image, and fonts are bundled with the site rather than loaded from a font host at
            view time.
          </p>
          <p>
            Accessibility is a floor, not an aspiration: every win/loss/tie is a letter and a
            written word, never color alone; every score and result has a full sentence for
            screen readers; contrast is measured against WCAG AA on every ink/surface pair the
            site actually uses, and a token edit that breaks that floor fails this
            repository&rsquo;s own tests before it can ship.
          </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- contact */}
        <section id="contact" className="mt-16">
          <span id="corrections" className="block" />
          <SectionHeader size="lg" kicker="Corrections &amp; contact" />
          <div className="sx-prose">
          <p>
            This is an independent hobby project with no staffed inbox, so the fastest way to
            check anything you think looks wrong is to compare it against the primary source
            directly &mdash; every team, standings and game on this site links back to its
            MaxPreps page, and the by-laws and schedule grids above link straight to SCVAL&rsquo;s
            own PDFs. If a number here disagrees with one of those sources, that is exactly what{' '}
            <a href="#cross-check" className="text-accent hover:underline">
              the cross-check log
            </a>{' '}
            is for, and it is worth checking there first: a real disagreement between sources is
            published, not hidden.
          </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- not affiliated */}
        <section id="not-affiliated" className="mt-16 mb-2">
          <SectionHeader size="lg" kicker="Not affiliated" />
          <div className="sx-prose">
          <p>
            This is an unofficial fan site. It is not affiliated with, endorsed by, or operated
            by the Santa Clara Valley Athletic League (SCVAL), the CIF Central Coast Section
            (CCS), MaxPreps or Sports Illustrated/SBLive. All team names, colors and marks belong
            to their respective schools. Records here are computed from published game results
            and, while we cross-check them and publish every disagreement we find, they may
            differ from an official ruling &mdash; the league&rsquo;s own standings are always
            the source of truth for anything that matters competitively, such as playoff
            seeding.
          </p>
          </div>
        </section>
      </div>
    </div>
  );
}
