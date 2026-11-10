import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';

import DayNav from '../../../components/schedule/DayNav';
import GameList from '../../../components/schedule/GameList';
import JvDayGames from '../../../components/jv/JvDayGames';
import { regionIdSuffix } from '../../../components/leaders/scope';
import ScoresRegionBlock, { MovedNote } from '../../../components/schedule/ScoresRegionBlock';
import SeasonCalendar from '../../../components/schedule/SeasonCalendar';
import { dayDescription, dayRegions, daySummary, leaguesInvolved } from '../../../components/schedule/day-summary';
import { dayBadges } from '../../../components/schedule/scores-page-view';
import { buildDayJvView } from '../../../components/jv/jv-view';
import EmptyState from '../../../components/ui/EmptyState';
import SectionHeader from '../../../components/ui/SectionHeader';
import { gameWord } from '../../../components/words/plural';
import { RegionSwitcher } from '../../../components/prefs/LeagueSwitcher';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE } from '../../../components/layout/site';
import { getGameDates, getGames, getLeagueSummaries, getOfficialFixtures, getToday } from '../../../lib/data';
import { longDate, monthDay, parseLocal, shortDate } from '../../../lib/format';
import { REGIONS } from '../../../lib/league-config/sections';
import { regionOf } from '../../../lib/leagues';
import { capitalized } from '../../../components/words/capitalized';
import { SPORT, SPORT_AUDIENCE } from '../../../lib/sports/current';

/**
 * `/scores/[date]` — one day's slate (DESIGN §1.1, §3.4).
 *
 * One prerendered page per date that actually has a contest (one per game date in the snapshot),
 * which is what makes the "Day page" link on every schedule date header a real URL instead of a
 * clipboard trick. Unknown dates `notFound()` rather than rendering an empty day, because an empty
 * day and a day with no games are different claims and only one of them is true.
 *
 * The previous / next day pills step through dates that HAVE contests, not calendar neighbours:
 * a link to an empty Sunday would be a dead end. "Pick a date" (SeasonCalendar) jumps straight to
 * any of them, every league's days included, and links only the days that have contests for the
 * same reason.
 *
 * Grouped by region, then by league (SPEC §10.4; DESIGN §24.3), the shape of the other index pages:
 *  - `<section id="norcal" data-region-scope="norcal">`, h2 "Northern California": one h3 group per
 *    NorCal league — its counted league games and its postseason games, `<SHORT> · <n> league games`
 *    — then `Non-league · <n>` for games between two NorCal teams or a NorCal team and a team outside
 *    the registry; then that region's moved-game note and its leagues' unreported official fixtures;
 *  - only on a day that has one, `<section id="between-regions">`, unscoped (shown in both views), h2
 *    "NorCal vs SoCal": the games with a registry side in each region, never repeated in a region block;
 *  - `<section id="socal" data-region-scope="socal">`, h2 "Southern California", the same for SoCal,
 *    its repeated ids suffixed `-socal` (`#non-league-socal`; DESIGN-socal §2.4).
 * A game appears once (day-summary.ts dayRegions). A region with no game that day still renders its
 * block, with one EmptyState sentence, so a reader in that region never meets an empty page. Without
 * JS both blocks render, NorCal first; the region switcher under the header picks one.
 *
 * The unreported official fixtures of the day are one block per league, inside its region: on a past
 * day `Scheduled by <SHORT>, not reported` (SPEC §10.4); today and on a day still to come, more of
 * the day ("Also on <SHORT>’s schedule for this day…"), never a missing result. The day's JV games
 * (lib/jv/jv.ts) come last, one block per region (`#jv`, `#jv-socal`), each region-scoped and omitted
 * when empty, never mixed into a league group or a varsity count.
 *
 * The header's badges and the meta description count each region (a NorCal vs SoCal game in both,
 * as on /schedule's every-day rows) only when both regions have a game; a one-region day keeps the
 * whole-day forms it always had.
 */

/** Every date with a contest is prerendered; anything else is a 404 rather than a runtime render. */
export const dynamicParams = false;

export function generateStaticParams(): { date: string }[] {
  return getGameDates().map((date) => ({ date }));
}

export async function generateMetadata({
  params,
}: PageProps<'/scores/[date]'>): Promise<Metadata> {
  const { date } = await params;
  if (!getGameDates().includes(date)) return { title: 'Day not found' };
  const games = getGames({ date });
  const year = parseLocal(date).year;
  const description = dayDescription(games, `${longDate(date)}, ${year}`);
  // The sport first: "Scores for Thu Sep 24" alone could be any sport's scores page.
  const title = `${capitalized(SPORT.noun)} scores — ${shortDate(date)}, ${year}`;
  return {
    title,
    description,
    alternates: { canonical: `/scores/${date}` },
    openGraph: { ...OG_BASE, title, description, url: `/scores/${date}` },
  };
}

export default async function ScoresByDatePage({ params }: PageProps<'/scores/[date]'>) {
  const { date } = await params;
  const dates = getGameDates();
  const index = dates.indexOf(date);
  if (index === -1) notFound();

  const games = getGames({ date });
  const year = parseLocal(date).year;
  const summary = daySummary(games, `${longDate(date)}, ${year}`);
  const previous = index > 0 ? dates[index - 1] : null;
  const next = index < dates.length - 1 ? dates[index + 1] : null;
  const today = getToday();
  const fixtures = getOfficialFixtures().filter((fixture) => fixture.dateKey === date);
  const fixtureLeagues = getLeagueSummaries()
    .map((league) => ({ league, rows: fixtures.filter((f) => f.league === league.id) }))
    .filter((block) => block.rows.length > 0);
  const { regions, between } = dayRegions(games);
  /* Both regions have a game (a NorCal vs SoCal game gives each one): the header counts and the
     "Full season" links go per region. A one-region day keeps the page's header as it always was. */
  const twoRegions = regions.every((region) => region.withSide.length > 0);
  // The day's JV games, after everything varsity (lib/jv/jv.ts), apart from every varsity count; one block per region.
  const jvBlocks = REGIONS.map((region) => ({
    region: region.id,
    shortName: region.shortName,
    idSuffix: regionIdSuffix(region.id),
    view: buildDayJvView(date, region.id),
  })).filter((block) => block.view.rows.length > 0);
  /* The leagues whose /schedule/<league> lists this date: every league with a side in one of the
     day's games (a cross-league game is on both leagues' lists), config order. */
  const involved = new Set(leaguesInvolved(games));
  const seasonLeagues = getLeagueSummaries().filter((league) => involved.has(league.id));
  /* The day has arrived and not one score has been published. The day still renders in full, with
     the promise attached, rather than looking like nothing happened (DESIGN §8). The wording never
     claims the games were played: at 5pm on a game day they may not have started. */
  const nothingReportedYet = date <= today && summary.total > 0 && summary.final === 0;

  // The header's fact badges: one run for the day, or one per region when both have a game (scores-page-view.ts).
  const badges = dayBadges(summary, regions, twoRegions, date, today);

  /* "Wednesday, Sep 30" on a phone: the full "Wednesday, September 30, 2026" took two lines of
     28px h1 at 390 on most days. The full date is still the h1's accessible name (the short form
     is aria-hidden), and from 768px it is what shows. */
  const shortTitle = `${longDate(date).split(',')[0]}, ${monthDay(date)}`;

  return (
    <div className="pb-section-lg">
      <PageHeader
        // What the page is, above the date the h1 names: the h1 alone ("Thursday, September 24,
        // 2026") never said which sport's scores these are.
        eyebrow={`${capitalized(SPORT_AUDIENCE)} scores`}
        title={
          <time dateTime={date}>
            {/* The trailing space keeps the h1's text content "Thursday, Sep 24 Thursday, September
                24, 2026" rather than one run-on string for a reader of the raw text (a crawler); it
                collapses at the end of the line on screen. */}
            <span aria-hidden="true" className="md:hidden">
              {shortTitle}{' '}
            </span>
            <span className="sr-only md:not-sr-only">
              {longDate(date)}, {year}
            </span>
          </time>
        }
        // Sans with tabular figures, not `.sx-num` mono: these are short phrases ("3 final scores"),
        // not a column of digits (DESIGN §4.3).
        meta={badges.map((badge) => (
          <span key={badge.key} data-region-scope={badge.region} className="sx-badge tabular-nums">
            {badge.text}
          </span>
        ))}
        // The previous / next day steppers and the day's "Full season" links.
        aside={<DayNav date={date} previous={previous} next={next} seasonLeagues={seasonLeagues} twoRegions={twoRegions} />}
      />

      {/* The region control, its own row under the header, as on the other index pages (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* Its own block under the header, closed by default so the day's games stay in the fold.
          Every league's game days: the day page is all-league. */}
      <SeasonCalendar dates={dates} current={date} className="mt-4 md:mt-6" />

      {nothingReportedYet ? (
        <p className="sx-inset mt-6 mb-0 max-w-prose text-ink">
          {summary.total} {gameWord(summary.total)} {summary.total === 1 ? 'is' : 'are'} on the
          schedule for {shortDate(date)} and no score has been reported yet. Coaches enter results by
          hand, so a game that finishes in the evening usually appears the next morning.
        </p>
      ) : null}

      {games.length > 0 ? (
        <>
          {regions.map((region, i) => (
            <Fragment key={region.id}>
              {/* The NorCal vs SoCal block sits between the two regions: after NorCal's, before SoCal's. */}
              {i === 1 && between.length > 0 ? (
                <section
                  id="between-regions"
                  aria-labelledby="between-regions-heading"
                  className="mt-section md:mt-section-lg"
                >
                  <SectionHeader
                    id="between-regions-heading"
                    kicker="NorCal vs SoCal"
                    meta={`${between.length} ${gameWord(between.length)}`}
                  />
                  <GameList games={between} tracks={between.length > 1 ? 'fit' : 'fill'} />
                  <MovedNote games={between} date={date} />
                </section>
              ) : null}
              <ScoresRegionBlock
                region={region}
                firstRegion={i === 0}
                betweenCount={between.length}
                jvCount={jvBlocks.find((block) => block.region === region.id)?.view.rows.length ?? 0}
                date={date}
                today={today}
                fixtureLeagues={fixtureLeagues.filter(({ league }) => regionOf(league.id) === region.id)}
              />
            </Fragment>
          ))}
        </>
      ) : (
        <div className="mt-8 md:mt-10">
          <EmptyState heading="No games on this date." />
        </div>
      )}

      {/* JV last of the games: the same schools' other teams, never mixed into the varsity
          groups above or their counts. One block per region (`#jv`, `#jv-socal`), each scoped to it
          and omitted when the region has no JV game that day. When both render, each names its
          region beside the count, so the two "JV games" headings (both visible without JS) differ. A
          day page exists only for a date with a varsity contest, so a JV-only date is on the team
          pages alone. */}
      {jvBlocks.map((block) => (
        <section
          key={block.region}
          id={`jv${block.idSuffix}`}
          data-region-scope={block.region}
          aria-labelledby={`jv${block.idSuffix}-heading`}
          className="mt-section md:mt-section-lg"
        >
          <SectionHeader
            id={`jv${block.idSuffix}-heading`}
            kicker="JV games"
            meta={`${jvBlocks.length > 1 ? `${block.shortName} · ` : ''}${block.view.rows.length} ${gameWord(block.view.rows.length)}`}
          />
          <JvDayGames view={block.view} />
        </section>
      ))}

      {/* One always-visible line under the day's games instead of a caption plus a "How scores
          are shown" disclosure: the zone every time here is in, the two states a reader can
          mistake for each other, the si.com mark, and the full table. "Unofficial" is not
          repeated here; the footer says it on every page. The link sits inside the sentence, so
          it needs no 24px box of its own (WCAG 2.5.8's inline exception). */}
      <p className="mt-stack mb-0 max-w-prose text-meta text-ink-3">
        All times Pacific. A dash means no score has been reported;{' '}
        <span className="sx-num">0</span> is a real zero; a &dagger; marks a score published from
        si.com under the site&rsquo;s rules for missing or wrong scores.{' '}
        <Link href="/about#conventions" prefetch={false} className="text-accent">
          How every state is shown
        </Link>
      </p>
    </div>
  );
}
