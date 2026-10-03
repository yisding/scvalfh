import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import GameList from '@/components/schedule/GameList';
import OfficialFixtures from '@/components/schedule/OfficialFixtures';
import SeasonCalendar from '@/components/schedule/SeasonCalendar';
import { daySummary } from '@/components/schedule/day-summary';
import { gameWord } from '@/components/schedule/filter-data';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeader from '@/components/ui/SectionHeader';
import PageHeader from '@/components/layout/PageHeader';
import { OG_BASE } from '@/components/layout/site-url';
import { getGameDates, getGames, getOfficialFixtures, getToday } from '@/lib/data';
import { longDate, monthDay, parseLocal, shortDate } from '@/lib/format';
import { getTeamBySlug } from '@/lib/teams';

/**
 * `/scores/[date]` — one day's slate (DESIGN §1.1, §3.4).
 *
 * One prerendered page per date that actually has a contest (49 today), which is what makes the
 * "Day page" link on every /schedule date header a real URL instead of a clipboard trick. Unknown
 * dates `notFound()` rather than rendering an empty day, because an empty day and a day with no
 * games are different claims and only one of them is true.
 *
 * The previous / next day pills step through dates that HAVE contests, not calendar neighbours:
 * a link to an empty Sunday would be a dead end. "Pick a date" (SeasonCalendar) jumps straight to
 * any of them, and links only the days that have contests for the same reason.
 */
/** A registry team renders by its short name; a non-SCVAL opponent is a name and nothing else. */
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
      title: `${title} — SCVAL Field Hockey`,
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
  /* `game.official.scheduledDate` is the date on the SCVAL grid. When it differs from the date the
     game is actually on, the game moved — worth one sentence, because a parent looking at the
     printed schedule will otherwise think we have the wrong day (SPEC §1.3). */
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
     pills (DESIGN §4.4), not bare text links. They sit on the card plane with the hairline ring
     (`bg-surface shadow-[var(--sx-ring)]`), so in light mode they read as buttons rather than as
     the surface-2 fact badges beside the h1; accent on surface is the strongest pairing the pill
     has. At the ends of the season the missing pill is a short badge — "First day" / "Last day",
     with " of the season" for screen readers only — so the row stays one line at 390. */
  const dayNav = (
    <nav aria-label="Other days" className="flex flex-wrap items-center gap-2">
      {previous ? (
        <Link
          href={`/scores/${previous}`}
          className="sx-pill min-h-11 bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
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
          className="sx-pill min-h-11 bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
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
      {/* A plain <a>, a document navigation on purpose: the browser keeps re-running its fragment
          scroll while /schedule's content-visibility groups settle, so the date's header lands
          under the top bar for every date. A client <Link> scrolls once, and only lands for dates
          within ScheduleList's ±7-day laid-out window around the Scores tab's date. */}
      <a
        href={`/schedule#${date}`}
        className="sx-action min-h-11 rounded-full px-3 text-meta font-medium text-accent no-underline hover:bg-surface-2"
      >
        Full season
      </a>
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

      {/* Its own block under the header, closed by default so the day's games stay in the fold. */}
      <SeasonCalendar dates={dates} current={date} className="mt-4 md:mt-6" />

      {nothingReportedYet ? (
        <p className="sx-inset mt-6 mb-0 max-w-prose text-ink">
          {summary.total} {gameWord(summary.total)} {summary.total === 1 ? 'is' : 'are'} on the
          schedule for {shortDate(date)} and no score has been reported yet. Coaches enter results by
          hand, so a game that finishes in the evening usually appears the next morning.
        </p>
      ) : null}

      <div className="mt-8 md:mt-10">
        {games.length > 0 ? (
          // Two or more cards fill the row, so they end where the pager, the fixtures card and
          // the disclosure below end; a lone card stays card-sized rather than 1200px wide.
          <GameList games={games} tracks={games.length > 1 ? 'fit' : 'fill'} />
        ) : (
          <EmptyState heading="No contests on this date." />
        )}
      </div>

      {moved.length > 0 ? (
        <p className="sx-inset mt-stack mb-0 max-w-prose">
          {moved.length === 1 ? 'One game here was moved' : `${moved.length} games here were moved`}{' '}
          from the date on SCVAL&rsquo;s official grid:{' '}
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

      {/* Fixtures on SCVAL's grid that no source lists. A day that has not come yet introduces
          them as more of the day ("Also on SCVAL's schedule…"), never as a missing result: its
          visible lead replaces the kicker, and an sr-only h2 keeps the same heading as a past day
          for screen readers moving by headings. A past day keeps the section and its note. The
          date column would repeat the h1, so it goes. */}
      {fixtures.length > 0 ? (
        date >= today ? (
          <section aria-labelledby="scval-only" className="mt-section md:mt-section-lg">
            <h2 id="scval-only" className="sr-only">
              On SCVAL&rsquo;s schedule only
            </h2>
            <OfficialFixtures
              fixtures={fixtures}
              today={today}
              variant="plain"
              showDate={false}
              lead="Also on SCVAL’s schedule for this day, but not listed by any source:"
            />
          </section>
        ) : (
          <section className="mt-section md:mt-section-lg">
            <SectionHeader kicker="On SCVAL's schedule only" />
            <OfficialFixtures fixtures={fixtures} today={today} variant="plain" showDate={false} />
          </section>
        )
      ) : null}

      {/* One always-visible line under the day's games instead of a caption plus a "How scores
          are shown" disclosure: the zone every time here is in, the two states a reader can
          mistake for each other, and the full table. "Unofficial" is not repeated here; the
          footer says it on every page. The link sits inside the sentence, so it needs no 24px
          box of its own (WCAG 2.5.8's inline exception). */}
      <p className="mt-stack mb-0 max-w-prose text-meta text-ink-3">
        All times Pacific. A dash means no score has been reported;{' '}
        <span className="sx-num">0</span> is a real zero.{' '}
        <Link href="/about#conventions" prefetch={false} className="text-accent">
          How every state is shown
        </Link>
      </p>
    </div>
  );
}
