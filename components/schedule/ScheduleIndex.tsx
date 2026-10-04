import Link from 'next/link';

import { longDate, plural, shortDate } from '../../lib/format';
import type { Game, LeagueId } from '../../lib/types';
import Arrow from '../ui/Arrow';
import { GameRow } from '../ui/GameRow';
import SectionHeader from '../ui/SectionHeader';

import { gameWord } from './filter-data';

/** What the index needs to know about a team: its slug's league. */
type SlugLeague = (slug: string) => LeagueId | undefined;

/** The leagues with ≥1 side in a game (config order is the caller's `leagues` order). */
function sideLeagues(game: Game, leagueOf: SlugLeague): Set<LeagueId> {
  const out = new Set<LeagueId>();
  for (const side of [game.away, game.home]) {
    const id = side.slug ? leagueOf(side.slug) : undefined;
    if (id) out.add(id);
  }
  return out;
}

/**
 * The index's data, from plain inputs (PURE: the page passes `getGames()`, the league summaries,
 * a slug → league lookup and `getToday()`). `Recent` = the last `days` game days up to today;
 * `Next` = the first `days` game days after it. A league's games on a day are those with at least
 * one side in it, so a cross-league game is listed once under each of its leagues.
 */
export function buildScheduleIndex(input: {
  games: readonly Game[];
  leagues: ReadonlyArray<{ id: LeagueId; shortName: string; name: string }>;
  leagueOf: SlugLeague;
  today: string;
  days?: number;
}): Omit<ScheduleIndexProps, 'perLeague'> {
  const n = input.days ?? 3;
  const sorted = [...input.games].sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
  const tagged = sorted.map((game) => ({ game, leagues: sideLeagues(game, input.leagueOf) }));
  const dates = [...new Set(sorted.map((g) => g.dateKey))].sort();

  const dayOf = (date: string): IndexDay => {
    const games = tagged.filter((t) => t.game.dateKey === date);
    return {
      date,
      total: games.length,
      leagues: input.leagues
        .map((l) => ({ id: l.id, shortName: l.shortName, games: games.filter((t) => t.leagues.has(l.id)).map((t) => t.game) }))
        .filter((l) => l.games.length > 0),
    };
  };

  const cards: LeagueCardData[] = input.leagues.map((l) => {
    const mine = tagged.filter((t) => t.leagues.has(l.id)).map((t) => t.game);
    const upcoming = mine.find(
      (g) => g.dateKey >= input.today && (g.status === 'scheduled' || g.status === 'live' || g.status === 'postponed'),
    );
    return {
      id: l.id,
      shortName: l.shortName,
      name: l.name,
      games: mine.length,
      results: mine.filter((g) => g.status === 'final').length,
      next: upcoming ? upcoming.dateKey : null,
    };
  });

  return {
    cards,
    recent: dates.filter((d) => d <= input.today).slice(-n).map(dayOf),
    next: dates.filter((d) => d > input.today).slice(0, n).map(dayOf),
    days: dates.map((date) => {
      const day = dayOf(date);
      return {
        date,
        total: day.total,
        byLeague: day.leagues.map((l) => ({ shortName: l.shortName, games: l.games.length })),
      };
    }),
  };
}

/**
 * The light `/schedule` index (SPEC §8.1, §10.4): the whole season no longer fits one fast page,
 * so this page is cards and an index, and each league's full season is `/schedule/<league>`.
 *
 *  - League cards: `<SHORT> · <n> games · <m> results · next <date> →` → `/schedule/<league>`
 *    (each card carries `id=<league>`, the jump links' target).
 *  - `Recent` (the last three game days up to today) and `Next` (the next three): each day grouped
 *    by league, at most three rows per league and `+<n> more →` the day's page. A cross-league game
 *    appears under both leagues, as it does on each league's schedule.
 *  - `Every game day`: one row per date with `id="YYYY-MM-DD"`, so an old `/schedule#2026-09-24`
 *    link lands on that day's row, which links `/scores/2026-09-24`.
 *
 * A server component over plain data; every row link carries `prefetch={false}`.
 */
export interface LeagueCardData {
  id: LeagueId;
  shortName: string;
  name: string;
  games: number;
  results: number;
  /** The next date with a game to come, or null when none is left. */
  next: string | null;
}

export interface IndexDay {
  date: string;
  total: number;
  leagues: Array<{ id: LeagueId; shortName: string; games: Game[] }>;
}

export interface ScheduleIndexProps {
  cards: LeagueCardData[];
  recent: IndexDay[];
  next: IndexDay[];
  /** Every game day, ascending. */
  days: Array<{ date: string; total: number; byLeague: Array<{ shortName: string; games: number }> }>;
  /** Rows per league in Recent and Next. */
  perLeague?: number;
}

function cardLine(card: LeagueCardData): string {
  const parts = [
    card.shortName,
    plural(card.games, 'game'),
    plural(card.results, 'result'),
  ];
  parts.push(card.next ? `next ${shortDate(card.next)}` : 'no games to come');
  return parts.join(' · ');
}

function DayBlock({ day, perLeague, headingId }: { day: IndexDay; perLeague: number; headingId: string }) {
  return (
    <section aria-labelledby={headingId} className="mt-6 first:mt-4">
      <div className="flex min-h-12 items-center gap-2">
        <h3 id={headingId} className="m-0 text-body font-semibold text-ink">
          <time dateTime={day.date}>
            <span aria-hidden="true">{shortDate(day.date)}</span>
            <span className="sr-only">{longDate(day.date)}</span>
          </time>
        </h3>
        <span className="sx-badge sx-num shrink-0">
          {day.total} {gameWord(day.total)}
        </span>
        <Link
          href={`/scores/${day.date}`}
          prefetch={false}
          className="sx-action ml-auto shrink-0 text-meta font-medium text-accent no-underline hover:underline"
        >
          The day<span className="sr-only">, {longDate(day.date)}</span> <Arrow />
        </Link>
      </div>
      {day.leagues.map((league) => {
        const more = league.games.length - perLeague;
        return (
          <div key={league.id} className="mt-2">
            <h4 className="m-0 mb-1 text-micro font-semibold text-ink-3">{league.shortName}</h4>
            <ol className="sx-list sx-bleed bg-surface shadow-[0_-1px_0_var(--sx-border),0_1px_0_var(--sx-border)]">
              {league.games.slice(0, perLeague).map((game) => (
                <li key={game.contestId}>
                  <GameRow game={game} scopeLeague={league.id} showRecap={false} />
                </li>
              ))}
            </ol>
            {more > 0 ? (
              <p className="m-0 mt-1">
                <Link
                  href={`/scores/${day.date}`}
                  prefetch={false}
                  className="sx-action text-meta font-medium text-accent hover:underline"
                >
                  +{more} more<span className="sr-only"> {league.shortName} {gameWord(more)} on {longDate(day.date)}</span> <Arrow />
                </Link>
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

export function ScheduleIndex({ cards, recent, next, days, perLeague = 3 }: ScheduleIndexProps) {
  return (
    <>
      <ul className="m-0 mt-8 grid list-none gap-3 p-0 md:mt-10 md:grid-cols-2">
        {cards.map((card) => (
          <li key={card.id} id={card.id} className="flex">
            <Link
              href={`/schedule/${card.id}`}
              prefetch={false}
              className="sx-card sx-lift flex w-full flex-col gap-1 p-4 no-underline md:p-5"
            >
              <span className="text-lead font-semibold text-ink">{card.shortName}</span>
              <span className="text-meta text-ink-3">{card.name}</span>
              <span className="text-body text-ink-2">
                {cardLine(card)} <Arrow />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {recent.length > 0 ? (
        <section aria-labelledby="schedule-recent" className="mt-section md:mt-section-lg">
          <SectionHeader id="schedule-recent" kicker="Recent" />
          {recent.map((day) => (
            <DayBlock key={day.date} day={day} perLeague={perLeague} headingId={`recent-${day.date}`} />
          ))}
        </section>
      ) : null}

      {next.length > 0 ? (
        <section aria-labelledby="schedule-next" className="mt-section md:mt-section-lg">
          <SectionHeader id="schedule-next" kicker="Next" />
          {next.map((day) => (
            <DayBlock key={day.date} day={day} perLeague={perLeague} headingId={`next-${day.date}`} />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="schedule-days" className="mt-section md:mt-section-lg">
        <SectionHeader id="schedule-days" kicker="Every game day" />
        <ol className="sx-list sx-card sx-flush sx-bleed mt-4">
          {days.map((day) => (
            <li key={day.date} id={day.date}>
              <Link
                href={`/scores/${day.date}`}
                prefetch={false}
                className="sx-tap flex min-h-row-1 items-center gap-3 px-gutter py-2 text-body text-ink no-underline hover:underline"
              >
                <span className="min-w-0 flex-1">
                  <time dateTime={day.date} className="font-semibold">
                    {shortDate(day.date)}
                  </time>
                  <span className="text-ink-2">
                    {` · ${plural(day.total, 'game')}`}
                    {day.byLeague.map((l) => ` · ${l.shortName} ${l.games}`).join('')}
                  </span>
                </span>
                <Arrow className="shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export default ScheduleIndex;
