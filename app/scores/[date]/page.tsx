import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';

import GameList from '../../../components/schedule/GameList';
import JvDayGames from '../../../components/schedule/JvDayGames';
import OfficialFixtures from '../../../components/schedule/OfficialFixtures';
import SeasonCalendar from '../../../components/schedule/SeasonCalendar';
import {
  dayDescription,
  dayRegions,
  daySummary,
  leaguesInvolved,
  type DayRegion,
} from '../../../components/schedule/day-summary';
import { countGames } from '../../../components/schedule/filter-data';
import { buildDayJvView } from '../../../components/teams/jv-view';
import EmptyState from '../../../components/ui/EmptyState';
import SectionHeader from '../../../components/ui/SectionHeader';
import { gameWord, plural } from '../../../components/ui/plural';
import { RegionSwitcher } from '../../../components/layout/LeagueSwitcher';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE } from '../../../components/layout/site';
import {
  getGameDates,
  getGames,
  getLeagueSummaries,
  getOfficialFixtures,
  getTeamBySlug,
  getToday,
} from '../../../lib/data';
import { longDate, monthDay, parseLocal, shortDate } from '../../../lib/format';
import { REGIONS, regionOf } from '../../../lib/leagues';
import type { Game, RegionId } from '../../../lib/types';

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
 * (lib/jv.ts) come last, one block per region (`#jv`, `#jv-socal`), each region-scoped and omitted
 * when empty, never mixed into a league group or a varsity count.
 *
 * The header's badges and the meta description count each region (a NorCal vs SoCal game in both,
 * as on /schedule's every-day rows) only when both regions have a game; a one-region day keeps the
 * whole-day forms it always had.
 */
/** A registry team renders by its short name; anyone else is a name and nothing else. */
function sideName(slug: string | null, fallback: string): string {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return team ? team.shortName : fallback;
}

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
  const title = `Scores for ${shortDate(date)}, ${year}`;
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
  // The day's JV games, after everything varsity (lib/jv.ts), apart from every varsity count; one block per region.
  const jvBlocks = REGIONS.map((region) => ({
    region: region.id,
    shortName: region.shortName,
    idSuffix: region.id === 'norcal' ? '' : '-socal',
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

  /* One run of badges for the day, or, when both regions have a game, one per region, each scoped
     to its region and led by its name ("NorCal: 6 games", "4 final scores" … "SoCal: 9 games" …). Without
     JS both runs show, NorCal first. "Today" is the day's, unscoped. */
  const countBadges = (counts: ReturnType<typeof countGames>, lead: string): string[] => {
    const out = [`${lead}${counts.total} ${gameWord(counts.total)}`];
    if (counts.final > 0) out.push(plural(counts.final, 'final score'));
    if (counts.upcoming > 0) out.push(`${counts.upcoming} to come`);
    if (counts.pending > 0) out.push(`${counts.pending} not reported`);
    return out;
  };
  const badges: Array<{ key: string; text: string; region?: RegionId }> = twoRegions
    ? regions.flatMap((region) =>
        countBadges(countGames(region.withSide), `${region.shortName}: `).map((text) => ({
          key: `${region.id}:${text}`,
          text,
          region: region.id,
        })),
      )
    : countBadges(summary, '').map((text) => ({ key: text, text }));
  if (date === today) badges.push({ key: 'Today', text: 'Today' });

  /* This is the only way to walk the season day by day on a phone, so the steppers are 44px
     pills (DESIGN §4.4), not bare text links. They are canvas pills (`sx-pill-ring`: the card
     plane with the hairline ring), so in light mode they read as buttons rather than as the
     surface-2 fact badges beside the h1; accent on surface is the strongest pairing the pill
     has. At the ends of the season the missing pill is a short badge — "First day" / "Last day",
     with " of the season" for screen readers only — so the steppers stay one line at 390. On a
     day with several leagues the "Full season" group wraps under them as one unit. */
  const dayNav = (
    <nav aria-label="Other days" className="flex flex-wrap items-center gap-2">
      {previous ? (
        <Link
          href={`/scores/${previous}`}
          className="sx-pill sx-pill-ring min-h-11"
        >
          <span aria-hidden="true">&lsaquo;</span>
          {shortDate(previous)}
          <span className="sr-only">: the previous day with games</span>
        </Link>
      ) : (
        <span className="sx-badge">
          First day<span className="sr-only"> of the season</span>
        </span>
      )}
      {next ? (
        <Link
          href={`/scores/${next}`}
          className="sx-pill sx-pill-ring min-h-11"
        >
          {shortDate(next)}
          <span aria-hidden="true">&rsaquo;</span>
          <span className="sr-only">: the next day with games</span>
        </Link>
      ) : (
        <span className="sx-badge">
          Last day<span className="sr-only"> of the season</span>
        </span>
      )}
      {/* The full season is a league's page (/schedule/<league>), aimed at this date's group,
          which every league with a side in one of the day's games has (a day with no league side
          at all would fall back to /schedule's index row for it). One league: "Full season".
          Several: "Full season" then one short-name link per league, each named in full for
          screen readers. Plain <a>s, document navigations on purpose: the browser keeps re-running
          its fragment scroll while the list's content-visibility groups settle, so the date's
          header lands under the top bar for every date. A client <Link> scrolls once, and only
          lands for dates within ScheduleList's ±7-day laid-out window around the Scores tab's
          date. On a day with games in both regions each league's link carries its region's
          `data-region-scope`, so a reader sees the label and their own region's leagues (NorCal's
          first without JS, config order). */}
      {seasonLeagues.length <= 1 ? (
        <a
          href={seasonLeagues[0] ? `/schedule/${seasonLeagues[0].id}#${date}` : `/schedule#${date}`}
          className="sx-action min-h-11 rounded-chip px-3 text-meta font-medium text-accent no-underline hover:bg-surface-2"
        >
          Full season
          {seasonLeagues[0] ? (
            <span className="sr-only">{`: the ${seasonLeagues[0].shortName} schedule, at ${shortDate(date)}`}</span>
          ) : null}
        </a>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-x-0.5">
          <span aria-hidden="true" className="text-meta text-ink-3">
            Full season
          </span>
          {/* The links wrap together, never one by one (tight padding and gap): if the screen
              or the font can't hold them all beside the label, they all drop under it rather
              than stranding the last league. */}
          <span className="inline-flex items-center gap-x-0.5">
            {seasonLeagues.map((league) => (
              <a
                key={league.id}
                data-region-scope={twoRegions ? regionOf(league.id) : undefined}
                href={`/schedule/${league.id}#${date}`}
                className="sx-action min-h-11 rounded-chip px-1.5 text-meta font-medium text-accent no-underline hover:bg-surface-2"
              >
                {league.shortName}
                <span className="sr-only">{` full season, at ${shortDate(date)}`}</span>
              </a>
            ))}
          </span>
        </span>
      )}
    </nav>
  );

  /* "Wednesday, Sep 30" on a phone: the full "Wednesday, September 30, 2026" took two lines of
     28px h1 at 390 on most days. The full date is still the h1's accessible name (the short form
     is aria-hidden), and from 768px it is what shows. */
  const shortTitle = `${longDate(date).split(',')[0]}, ${monthDay(date)}`;

  return (
    <div className="pb-section-lg">
      <PageHeader
        title={
          <time dateTime={date}>
            <span aria-hidden="true" className="md:hidden">
              {shortTitle}
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
        aside={dayNav}
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
              <RegionBlock
                region={region}
                first={i === 0}
                betweenCount={between.length}
                betweenBelow={i === 0}
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

/** One league's unreported official fixtures of the day (`fixtureLeagues` above). */
interface FixtureBlock {
  league: ReturnType<typeof getLeagueSummaries>[number];
  rows: ReturnType<typeof getOfficialFixtures>;
}

/**
 * `game.official.scheduledDate` is the date on the league's official schedule. When it differs from
 * the date the game is actually on, the game moved — worth one sentence, because a parent looking at
 * the printed schedule will otherwise think we have the wrong day. One sentence per block, over that
 * block's games, so a region's note never names the other region's games.
 */
function MovedNote({ games, date }: { games: readonly Game[]; date: string }) {
  const moved = games.filter((game) => game.official && game.official.scheduledDate !== date);
  if (moved.length === 0) return null;
  return (
    <p className="sx-inset mt-stack mb-0 max-w-prose">
      {moved.length === 1 ? 'One game here was moved' : `${moved.length} games here were moved`}{' '}
      from the date on the league&rsquo;s official schedule:{' '}
      {moved
        .map(
          (game) =>
            `${sideName(game.away.slug, game.away.name)} at ${sideName(
              game.home.slug,
              game.home.name,
            )}, originally ${shortDate(game.official?.scheduledDate ?? date)}`,
        )
        .join('; ')}
      .
    </p>
  );
}

/**
 * One region's block (DESIGN §24.3): `<section id="norcal|socal" data-region-scope>` under an h2 naming
 * the region, holding its "Leagues on this day" pills (two groups or more), its league groups and its
 * Non-league group (h3s, so the outline stays region → group with both regions visible), its moved-game
 * note and its leagues' unreported official fixtures. NorCal's ids are the page's ids from before the
 * regions (`#scval`, `#non-league`, `#scval-heading`); SoCal's repeated ones take `-socal`
 * (`#non-league-socal`). A SoCal group is labelled by its heading AND the region's, so with JS off two
 * "Non-league · 3" sections never share an accessible name (axe landmark-unique; the /schedule index's
 * fix, review 2026-10-06); the SoCal pills' nav is named for its region for the same reason.
 *
 * A region with no game that day keeps its block with one sentence, so a reader in that region sees what
 * is true rather than an empty page: "No Southern California games on this day." When the day's only
 * games with a side in the region are NorCal vs SoCal it adds "besides the NorCal vs SoCal game above",
 * and when the region has JV games that day (a day page exists for any varsity game, so Aug 18 has a
 * page for its six SoCal games and NorCal JV games too) it says "varsity" and points at them, because
 * "no games" above a list of that region's JV games would not be true. For the same reason a region whose
 * leagues' official schedules list a game no source has says "No source lists …" and points at it.
 */
function RegionBlock({
  region,
  first,
  betweenCount,
  betweenBelow,
  jvCount,
  date,
  today,
  fixtureLeagues,
}: {
  region: DayRegion;
  first: boolean;
  /** The day's NorCal vs SoCal games, for the empty sentence. */
  betweenCount: number;
  /** Where that block sits from this one: below NorCal's, above SoCal's. */
  betweenBelow: boolean;
  /** The region's JV games that day (its `#jv` block below), for the empty sentence. */
  jvCount: number;
  date: string;
  today: string;
  fixtureLeagues: readonly FixtureBlock[];
}) {
  const headingId = `${region.id}-heading`;
  const labelledBy = (groupId: string) =>
    region.idSuffix === '' ? `${groupId}-heading` : `${groupId}-heading ${headingId}`;
  const besides =
    betweenCount === 0 ? '' : ` besides the NorCal vs SoCal ${gameWord(betweenCount)} ${betweenBelow ? 'below' : 'above'}`;
  const jvNote = jvCount === 0 ? '' : `; the JV ${gameWord(jvCount)} ${jvCount === 1 ? 'is' : 'are'} below`;
  const varsity = jvCount === 0 ? '' : 'varsity ';
  // A league's official fixture with no source behind it (the blocks at the end of this one) is still a
  // game on that day, so a region with one never reads "No … games"; none such on 2026-10-06's data.
  const fixtureCount = fixtureLeagues.reduce((n, block) => n + block.rows.length, 0);
  const empty =
    fixtureCount === 0
      ? `No ${region.name} ${varsity}games on this day${besides}${jvNote}.`
      : `No source lists a ${region.name} ${varsity}game on this day${besides}; ${
          fixtureCount === 1 ? 'one on a league’s official schedule is' : `${fixtureCount} on league official schedules are`
        } below${jvNote}.`;
  return (
    <section
      id={region.id}
      data-region-scope={region.id}
      aria-labelledby={headingId}
      className={first ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
    >
      <SectionHeader id={headingId} kicker={region.name} />

      {region.groups.length >= 2 ? (
        <nav
          aria-label={region.idSuffix === '' ? 'Leagues on this day' : `${region.name} leagues on this day`}
          className="mt-4 flex flex-wrap gap-2"
        >
          {region.groups.map((group) => (
            <a key={group.id} href={`#${group.id}`} className="sx-pill sx-pill-ring min-h-11">
              {group.kicker}
            </a>
          ))}
        </nav>
      ) : null}

      {region.games.length === 0 ? (
        <EmptyState heading={empty} className="mt-4" />
      ) : (
        region.groups.map((group, index) => (
          <section
            key={group.id}
            id={group.id}
            aria-labelledby={labelledBy(group.id)}
            className={index === 0 ? 'mt-6' : 'mt-8 md:mt-10'}
          >
            <SectionHeader as="h3" id={`${group.id}-heading`} kicker={group.kicker} />
            {/* Two or more cards fill the row, so they end where the pager, the fixtures card
                and the disclosure below end; a lone card stays card-sized rather than 1200px wide. */}
            <GameList games={group.games} tracks={group.games.length > 1 ? 'fit' : 'fill'} />
          </section>
        ))
      )}

      <MovedNote games={region.games} date={date} />

      {/* Fixtures on a league's official schedule that no source lists, one block per league. A
          day that has not come yet (or is today) introduces them as more of the day ("Also on
          <SHORT>’s schedule…"), never as a missing result: its visible lead replaces the kicker,
          and an sr-only h3 in the lead's own words keeps a heading for screen readers moving by
          headings, as a past day's SPEC §10.4 kicker does. The date column would repeat the h1,
          so it goes. */}
      {fixtureLeagues.map(({ league, rows }) =>
        date >= today ? (
          <section key={league.id} aria-labelledby={`${league.id}-schedule-only`} className="mt-8 md:mt-10">
            <h3 id={`${league.id}-schedule-only`} className="sr-only">
              {`Also on ${league.shortName}’s schedule`}
            </h3>
            <OfficialFixtures
              fixtures={rows}
              leagueId={league.id}
              today={today}
              variant="plain"
              showDate={false}
              lead={`Also on ${league.shortName}’s schedule for this day, but not listed by any source:`}
            />
          </section>
        ) : (
          <section key={league.id} className="mt-8 md:mt-10">
            <SectionHeader as="h3" kicker={`Scheduled by ${league.shortName}, not reported`} />
            <OfficialFixtures fixtures={rows} leagueId={league.id} today={today} variant="plain" showDate={false} />
          </section>
        ),
      )}
    </section>
  );
}
