import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import GameList from '@/components/schedule/GameList';
import OfficialFixtures from '@/components/schedule/OfficialFixtures';
import { daySummary } from '@/components/schedule/day-summary';
import { gameWord } from '@/components/schedule/filter-data';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE } from '@/components/layout/site-url';
import { getGameDates, getGames, getOfficialFixtures, getToday } from '@/lib/data';
import { longDate, parseLocal, shortDate } from '@/lib/format';
import { getTeamBySlug } from '@/lib/teams';

/**
 * `/scores/[date]` — one day's slate (DESIGN §1.1, §3.4).
 *
 * One prerendered page per date that actually has a contest (49 today), which is what makes the
 * `share →` action on every date header a real URL instead of a clipboard trick. Unknown dates
 * `notFound()` rather than rendering an empty day, because an empty day and a day with no games are
 * different claims and only one of them is true.
 *
 * `← previous day` / `next day →` step through dates that HAVE contests, not calendar neighbours:
 * a link to an empty Sunday would be a dead end.
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

  return (
    <div className="pb-10">
      <p className="mt-3 mb-1 font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3">
        One day
      </p>
      <h1 className="m-0 text-h1 font-semibold text-ink">
        <time dateTime={date}>
          {longDate(date)}, {year}
        </time>
      </h1>
      <p className="sx-num m-0 mt-1 text-meta text-ink-2">
        {summary.total} {gameWord(summary.total)}
        {summary.final > 0 ? ` · ${summary.final} final` : ''}
        {summary.upcoming > 0 ? ` · ${summary.upcoming} to come` : ''}
        {summary.pending > 0 ? ` · ${summary.pending} not reported` : ''}
        {date === today ? ' · today' : ''}
      </p>

      {/* This is the only way to walk the season day by day on a phone, so the three links take
          DESIGN §4.4's full 44px rather than the 24px floor — they shipped as bare 18px block links
          with no padding at all, under even WCAG 2.5.8's minimum, and 16px apart on one baseline so
          the spacing exception did not rescue them either. `sx-action` gives the box; `min-h-11`
          raises it; the 44px height is itself what clears the 24px spacing circle. */}
      <nav
        aria-label="Other days"
        className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta"
      >
        {previous ? (
          <Link
            href={`/scores/${previous}`}
            className="sx-action min-h-11 text-accent hover:underline"
          >
            <span aria-hidden="true">&larr;</span>&nbsp;{shortDate(previous)}
            <span className="sr-only">: the previous day with games</span>
          </Link>
        ) : (
          <span className="sx-action min-h-11 text-ink-3">First day of the season</span>
        )}
        {next ? (
          <Link href={`/scores/${next}`} className="sx-action min-h-11 text-accent hover:underline">
            {shortDate(next)}&nbsp;<span aria-hidden="true">&rarr;</span>
            <span className="sr-only">: the next day with games</span>
          </Link>
        ) : (
          <span className="sx-action min-h-11 text-ink-3">Last day of the season</span>
        )}
        <Link href={`/schedule#${date}`} className="sx-action min-h-11 text-accent hover:underline">
          Full season&nbsp;<span aria-hidden="true">&rarr;</span>
        </Link>
      </nav>

      {nothingReportedYet ? (
        <p className="mt-3 mb-0 max-w-[62ch] rounded-card bg-surface-2 p-3 text-meta text-ink">
          {summary.total} {gameWord(summary.total)} {summary.total === 1 ? 'is' : 'are'} on the
          schedule for {shortDate(date)} and no score has been reported yet. Coaches enter results by
          hand, so a game that finishes in the evening usually appears the next morning.
        </p>
      ) : null}

      <div className="mt-4">
        {games.length > 0 ? (
          <GameList games={games} />
        ) : (
          <p className="m-0 text-meta text-ink-2">No contests on this date.</p>
        )}
      </div>

      {moved.length > 0 ? (
        <p className="mt-4 mb-0 max-w-[62ch] text-meta text-ink-3">
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

      {fixtures.length > 0 ? (
        <section className="mt-8">
          <SectionHeader kicker="Scheduled by SCVAL, not reported" />
          <OfficialFixtures fixtures={fixtures} variant="plain" />
        </section>
      ) : null}

      <p className="mt-8 mb-0 max-w-[62ch] text-meta text-ink-3">
        All times Pacific. A real <span className="sx-num">0</span> shows as{' '}
        <span className="sx-num">0</span>; a score we do not have shows as a dash. Scores are
        computed from what MaxPreps publishes and are unofficial &mdash;{' '}
        <Link href="/about#conventions" className="text-accent hover:underline">
          how every state is rendered <span aria-hidden="true">&rarr;</span>
        </Link>
      </p>
    </div>
  );
}
