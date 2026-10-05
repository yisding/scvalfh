import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import GameList from '../../../components/schedule/GameList';
import OfficialFixtures from '../../../components/schedule/OfficialFixtures';
import SeasonCalendar from '../../../components/schedule/SeasonCalendar';
import { dayGroups, daySummary, leaguesInvolved } from '../../../components/schedule/day-summary';
import EmptyState from '../../../components/ui/EmptyState';
import SectionHeader from '../../../components/ui/SectionHeader';
import { gameWord } from '../../../components/ui/plural';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE, SITE_NAME } from '../../../components/layout/site';
import {
  getGameDates,
  getGames,
  getLeagueSummaries,
  getOfficialFixtures,
  getTeamBySlug,
  getToday,
} from '../../../lib/data';
import { longDate, monthDay, parseLocal, shortDate } from '../../../lib/format';

/**
 * `/scores/[date]` — one day's slate (DESIGN §1.1, §3.4).
 *
 * One prerendered page per date that actually has a contest (49 today), which is what makes the
 * "Day page" link on every schedule date header a real URL instead of a clipboard trick. Unknown
 * dates `notFound()` rather than rendering an empty day, because an empty day and a day with no
 * games are different claims and only one of them is true.
 *
 * The previous / next day pills step through dates that HAVE contests, not calendar neighbours:
 * a link to an empty Sunday would be a dead end. "Pick a date" (SeasonCalendar) jumps straight to
 * any of them, every league's days included, and links only the days that have contests for the
 * same reason.
 *
 * Grouped by league (SPEC §10.4): one group per league — its counted league games and its
 * postseason games, `<SHORT> · <n> league games` — then `Non-league · <n>` for the rest; a game
 * appears once. The unreported official fixtures of the day are one block per league: on a past
 * day `Scheduled by <SHORT>, not reported` (SPEC §10.4); today and on a day still to come, more of
 * the day ("Also on <SHORT>’s schedule for this day…"), never a missing result.
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
  const summary = daySummary(games, `${longDate(date)}, ${year}`);
  const title = `Scores for ${shortDate(date)}, ${year}`;
  return {
    title,
    description: summary.sentence,
    alternates: { canonical: `/scores/${date}` },
    openGraph: {
      ...OG_BASE,
      title: `${title} — ${SITE_NAME}`,
      description: summary.sentence,
      url: `/scores/${date}`,
    },
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
  const groups = dayGroups(games);
  /* The leagues whose /schedule/<league> lists this date: every league with a side in one of the
     day's games (a cross-league game is on both leagues' lists), config order. */
  const involved = new Set(leaguesInvolved(games));
  const seasonLeagues = getLeagueSummaries().filter((league) => involved.has(league.id));
  /* `game.official.scheduledDate` is the date on the league's official schedule. When it differs
     from the date the game is actually on, the game moved — worth one sentence, because a parent
     looking at the printed schedule will otherwise think we have the wrong day. */
  const moved = games.filter((game) => game.official && game.official.scheduledDate !== date);

  /* The day has arrived and not one score has been published. The day still renders in full, with
     the promise attached, rather than looking like nothing happened (DESIGN §8). The wording never
     claims the games were played: at 5pm on a game day they may not have started. */
  const nothingReportedYet = date <= today && summary.total > 0 && summary.final === 0;

  const badges: string[] = [`${summary.total} ${gameWord(summary.total)}`];
  if (summary.final > 0) badges.push(`${summary.final} final`);
  if (summary.upcoming > 0) badges.push(`${summary.upcoming} to come`);
  if (summary.pending > 0) badges.push(`${summary.pending} not reported`);
  if (date === today) badges.push('Today');

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
          date. */}
      {seasonLeagues.length <= 1 ? (
        <a
          href={seasonLeagues[0] ? `/schedule/${seasonLeagues[0].id}#${date}` : `/schedule#${date}`}
          className="sx-action min-h-11 rounded-full px-3 text-meta font-medium text-accent no-underline hover:bg-surface-2"
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
                href={`/schedule/${league.id}#${date}`}
                className="sx-action min-h-11 rounded-full px-1.5 text-meta font-medium text-accent no-underline hover:bg-surface-2"
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
        // Sans with tabular figures, not `.sx-num` mono: these are short phrases ("3 final"),
        // not a column of digits (DESIGN §4.3).
        meta={badges.map((badge) => (
          <span key={badge} className="sx-badge tabular-nums">
            {badge}
          </span>
        ))}
        aside={dayNav}
      />

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

      {groups.length >= 2 ? (
        <nav aria-label="Leagues on this day" className="mt-6 flex flex-wrap gap-2">
          {groups.map((group) => (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="sx-pill sx-pill-ring min-h-11"
            >
              {group.kicker}
            </a>
          ))}
        </nav>
      ) : null}

      {games.length > 0 ? (
        groups.map((group, index) => (
          <section
            key={group.id}
            id={group.id}
            aria-labelledby={`${group.id}-heading`}
            className={index === 0 ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
          >
            <SectionHeader id={`${group.id}-heading`} kicker={group.kicker} />
            {/* Two or more cards fill the row, so they end where the pager, the fixtures card
                and the disclosure below end; a lone card stays card-sized rather than 1200px wide. */}
            <GameList games={group.games} tracks={group.games.length > 1 ? 'fit' : 'fill'} />
          </section>
        ))
      ) : (
        <div className="mt-8 md:mt-10">
          <EmptyState heading="No contests on this date." />
        </div>
      )}

      {moved.length > 0 ? (
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
      ) : null}

      {/* Fixtures on a league's official schedule that no source lists, one block per league. A
          day that has not come yet (or is today) introduces them as more of the day ("Also on
          <SHORT>’s schedule…"), never as a missing result: its visible lead replaces the kicker,
          and an sr-only h2 in the lead's own words keeps a heading for screen readers moving by
          headings, as a past day's SPEC §10.4 kicker does. The date column would repeat the h1,
          so it goes. */}
      {fixtureLeagues.map(({ league, rows }) =>
        date >= today ? (
          <section
            key={league.id}
            aria-labelledby={`${league.id}-schedule-only`}
            className="mt-section md:mt-section-lg"
          >
            <h2 id={`${league.id}-schedule-only`} className="sr-only">
              {`Also on ${league.shortName}’s schedule`}
            </h2>
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
          <section key={league.id} className="mt-section md:mt-section-lg">
            <SectionHeader kicker={`Scheduled by ${league.shortName}, not reported`} />
            <OfficialFixtures fixtures={rows} leagueId={league.id} today={today} variant="plain" showDate={false} />
          </section>
        ),
      )}

      {/* One always-visible line under the day's games instead of a caption plus a "How scores
          are shown" disclosure: the zone every time here is in, the two states a reader can
          mistake for each other, the si.com mark, and the full table. "Unofficial" is not
          repeated here; the footer says it on every page. The link sits inside the sentence, so
          it needs no 24px box of its own (WCAG 2.5.8's inline exception). */}
      <p className="mt-stack mb-0 max-w-prose text-meta text-ink-3">
        All times Pacific. A dash means no score has been reported;{' '}
        <span className="sx-num">0</span> is a real zero; a &dagger; marks a score published from
        si.com under the site&rsquo;s backfill rule.{' '}
        <Link href="/about#conventions" prefetch={false} className="text-accent">
          How every state is shown
        </Link>
      </p>
    </div>
  );
}
