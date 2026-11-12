import Link from 'next/link';
import { Fragment } from 'react';

import JvDayGames from '../jv/JvDayGames';
import { buildDayJvView } from '../jv/jv-view';
import LastUpdated from '../layout/LastUpdated';
import PageHeader from '../layout/PageHeader';
import { BUILD_INSTANT } from '../layout/build-instant';
import { leagueChips } from '../layout/league-chips';
import { SITE_NAME } from '../layout/site';
import { regionIdSuffix } from '../leaders/scope';
import ScopeBar from '../prefs/ScopeBar';
import SectionHeader from '../ui/SectionHeader';
import { gameWord, plural } from '../words/plural';
import { shortNameOf } from '../words/team-short-name';
import {
  getFetchedAt,
  getGameDates,
  getGames,
  getLeagueSummaries,
  getOfficialFixtures,
  getTeams,
  getToday,
} from '../../lib/data';
import { dayDiff, longDate, monthDay, shortDate, timeOfDay } from '../../lib/format';
import { REGIONS } from '../../lib/league-config/sections';
import { regionOf } from '../../lib/leagues';
import type { Game, LeagueId, RegionId } from '../../lib/types';

import DateBar from './DayNav';
import GameList from './GameList';
import LiveBoard from './LiveBoard';
import { MyTeamLine, type MyTeamLines } from './MyTeamLine';
import ScoreRail from './ScoreRail';
import ScoresRegionBlock, { DayGroups, MovedNote, dayWords } from './ScoresRegionBlock';
import { dayGroups, dayRegions, gamesOfLeague } from './day-summary';

/**
 * The Scores page (DESIGN §33): ONE date-driven view for `/` (app/page.tsx), `/schedule` (today's
 * Pacific date, exactly like `/`) and `/scores/[date]`. The view shows the selected day; the date bar
 * is the filter and the visible title, so the h1 is for screen readers only.
 *
 * In order: the live board (today only, while a game is being played; a game on it is not in the list
 * below); the league row (league tabs, region switch, the short Updated stamp unless the board has
 * it); then main + rail from 768. Main: the date bar (the one sticky bar), `before` (home's
 * first-visit block), the reader's team line, each region's groups (ScoresRegionBlock), the NorCal vs
 * SoCal games between the two regions, the day's JV games, and on today the previous and next game
 * day as plain links. The rail is the standings (ScoreRail).
 *
 * A day with no games at all: any day but today says so with the next game day linked; today (home
 * on an off day) says "No games today." and then lists the latest results and the next games, the
 * only place those two sections exist.
 *
 * Static: "today" is the snapshot's own Pacific day (`getToday()`), never `Date.now()`, and nothing
 * here reads search params. The reader's pin and league live in the browser: the scope stylesheet and
 * the `data-pinned` stamp do the personal parts (which league's groups show, the reader's game first).
 */
export interface ScoreDayProps {
  /** 'YYYY-MM-DD' */
  date: string;
  /** This is `/`: the h1 leads with the site's name. */
  home?: boolean;
  /** Rendered at the top of the main column, under the date bar (home's "Find your team"). */
  before?: React.ReactNode;
}

/** 'Sat 4:00 PM vs Mitty' for a game this week, 'Nov 21 4:00 PM at Gilroy' further out. */
function nextWords(game: Game, slug: string, today: string): string {
  const home = game.home.slug === slug;
  const other = home ? game.away : game.home;
  const day = dayDiff(today, game.dateKey) < 7 ? shortDate(game.dateKey).split(' ')[0] : monthDay(game.dateKey);
  const time = game.isTimeTba ? 'TBD' : timeOfDay(game.dateLocal);
  return `${day} ${time} ${home || game.site === 'neutral' ? 'vs' : 'at'} ${shortNameOf(other.slug, other.name)}`;
}

/** 'W 2-0 vs Gilroy': a team's last reported final. */
function lastWords(game: Game, slug: string): string | null {
  const home = game.home.slug === slug;
  const [own, other] = home ? [game.home, game.away] : [game.away, game.home];
  if (own.score === null || other.score === null) return null;
  const letter = own.result === 'W' || own.result === 'L' || own.result === 'T' ? own.result : own.score > other.score ? 'W' : own.score < other.score ? 'L' : 'T';
  return `${letter} ${own.score}-${other.score} ${home || game.site === 'neutral' ? 'vs' : 'at'} ${shortNameOf(other.slug, other.name)}`;
}

/** The team line's words for every team with no game on `date`: its next game, else its last result. */
function teamLines(date: string, today: string): MyTeamLines {
  const bySlug = new Map<string, Game[]>();
  for (const game of [...getGames()].sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))) {
    for (const side of [game.away, game.home]) {
      if (!side.slug) continue;
      const list = bySlug.get(side.slug) ?? [];
      list.push(game);
      bySlug.set(side.slug, list);
    }
  }
  const out: Record<string, readonly [string, string]> = {};
  for (const team of getTeams()) {
    const games = bySlug.get(team.slug) ?? [];
    if (games.some((game) => game.dateKey === date)) continue;
    const next = games.find((game) => game.dateKey >= today && (game.status === 'scheduled' || game.status === 'live'));
    const last = [...games].reverse().find((game) => game.status === 'final' && game.dateKey <= today);
    const words = next ? nextWords(next, team.slug, today) : last ? lastWords(last, team.slug) : null;
    if (words) out[team.slug] = [team.shortName, words];
  }
  return out;
}

/** Every date a league has a game on, ascending; the data is one snapshot, so this is computed once. */
const LEAGUE_DATES = new Map<LeagueId, readonly string[]>();
function leagueDates(league: LeagueId): readonly string[] {
  let days = LEAGUE_DATES.get(league);
  if (!days) {
    days = [...new Set(gamesOfLeague(getGames(), league).map((game) => game.dateKey))].sort();
    LEAGUE_DATES.set(league, days);
  }
  return days;
}

/**
 * A fallback section on a today with no games: one other day of ONE region (its own last or next game
 * day, so a reader never meets a heading with nothing under it), four rows a group.
 */
function OtherDay({ id, heading, date, games, linkLabel }: { id: string; heading: string; date: string; games: readonly Game[]; linkLabel: string }) {
  return (
    <section className="sx-section" aria-labelledby={id}>
      <h2 id={id} className="sx-dayhead">
        {heading}{' '}
        <Link href={`/scores/${date}`} prefetch={false}>
          {longDate(date)}
        </Link>
      </h2>
      <DayGroups groups={dayGroups(games)} limit={4} />
      <ul className="sx-linkrow">
        <li>
          <Link href={`/scores/${date}`} prefetch={false} className="sx-action">
            {linkLabel}
          </Link>
        </li>
      </ul>
    </section>
  );
}

export function ScoreDay({ date, home = false, before }: ScoreDayProps) {
  const today = getToday();
  const dates = getGameDates();
  const isToday = date === today;
  const all = [...getGames({ date })].sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
  // A game being played is on the board and nowhere else on the page.
  const live = isToday ? all.filter((game) => game.status === 'live') : [];
  const games = all.filter((game) => !live.includes(game));
  const { regions, between } = dayRegions(games);
  const liveRegions = dayRegions(live).regions;
  const boards = new Set<RegionId>(liveRegions.filter((region) => region.withSide.length > 0).map((region) => region.id));

  const stamp = <LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" />;
  /* The stamp is beside the scores once: in a region's board head when it has a board, else at the
     end of the league row. */
  const rowStamp =
    boards.size === 0 ? (
      stamp
    ) : boards.size === REGIONS.length ? undefined : (
      <>
        {REGIONS.filter((region) => !boards.has(region.id)).map((region) => (
          <span key={region.id} data-region-scope={region.id}>
            {stamp}
          </span>
        ))}
      </>
    );

  const fixtures = getOfficialFixtures().filter((fixture) => fixture.dateKey === date);
  const leagues = getLeagueSummaries();
  const fixtureLeagues = leagues
    .map((league) => ({ league, rows: fixtures.filter((f) => f.league === league.id) }))
    .filter((block) => block.rows.length > 0);
  // The day's JV games, after everything varsity (lib/jv/jv.ts), apart from every varsity count; one block per region.
  const jvBlocks = REGIONS.map((region) => ({
    region: region.id,
    shortName: region.shortName,
    idSuffix: regionIdSuffix(region.id),
    view: buildDayJvView(date, region.id),
  })).filter((block) => block.view.rows.length > 0);

  /** A day's games with a side in the region (a NorCal vs SoCal game is in both). */
  const sideGames = (d: string, region: RegionId): readonly Game[] =>
    dayRegions(getGames({ date: d })).regions.find((r) => r.id === region)?.withSide ?? [];
  /** A region's next game day after the selected one. */
  const nextIn = (region: RegionId): string | null => dates.find((d) => d > date && sideGames(d, region).length > 0) ?? null;

  const next = dates.find((d) => d > date) ?? null;
  const nothing = all.length === 0;

  return (
    <div className="pb-section-lg">
      {liveRegions.map((region) => (
        <LiveBoard key={region.id} region={region.id} games={region.withSide} idSuffix={region.idSuffix} stamp={stamp} />
      ))}

      <PageHeader title={home ? `${SITE_NAME}, scores` : `Scores, ${longDate(date)}`} titleHidden />

      <ScopeBar league={{ mode: 'scope', includeAll: true, label: 'Your league', leagues: leagueChips() }} stamp={rowStamp} />

      <div className="sx-cols">
        <div className="min-w-0">
          <DateBar date={date} dates={dates} today={today} gamesOn={(d) => getGames({ date: d })} />

          {before}

          <MyTeamLine lines={teamLines(date, today)} />

          {nothing ? (
            <>
              <section className="sx-section" data-first="">
                <p className="sx-empty">
                  {isToday ? (
                    'No games today.'
                  ) : (
                    <>
                      No games on this date.
                      {next ? (
                        <>
                          {' '}
                          Next games:{' '}
                          <Link href={next === today ? '/' : `/scores/${next}`} prefetch={false} className="sx-link">
                            {dayWords(next)}
                          </Link>
                        </>
                      ) : null}
                    </>
                  )}
                </p>
              </section>
              {isToday
                ? REGIONS.map((region) => {
                    const suffix = regionIdSuffix(region.id);
                    const last = [...dates].reverse().find((d) => d < date && sideGames(d, region.id).length > 0);
                    const coming = dates.find((d) => d > date && sideGames(d, region.id).length > 0);
                    /* The league tabs stay live on an off day: the All tab shows the region's last and
                       next game day, and each league's tab its OWN last and next day, never the region's. */
                    const regionLeagues = leagues.filter((league) => regionOf(league.id) === region.id);
                    return (
                      <div key={region.id} data-region-scope={region.id}>
                        <div data-scope="none">
                          {last ? (
                            <OtherDay
                              id={`latest-results${suffix}`}
                              heading="Latest results"
                              date={last}
                              games={sideGames(last, region.id)}
                              linkLabel="All results"
                            />
                          ) : null}
                          {coming ? (
                            <OtherDay
                              id={`next-up${suffix}`}
                              heading="Next up"
                              date={coming}
                              games={sideGames(coming, region.id)}
                              linkLabel="All games"
                            />
                          ) : null}
                        </div>
                        {regionLeagues.map((league) => {
                          const days = leagueDates(league.id);
                          const lastOwn = [...days].reverse().find((d) => d < date);
                          const comingOwn = days.find((d) => d > date);
                          return (
                            <div key={league.id} data-scope={league.id}>
                              {lastOwn ? (
                                <OtherDay
                                  id={`latest-results${suffix}-${league.id}`}
                                  heading="Latest results"
                                  date={lastOwn}
                                  games={gamesOfLeague(getGames({ date: lastOwn }), league.id)}
                                  linkLabel="All results"
                                />
                              ) : null}
                              {comingOwn ? (
                                <OtherDay
                                  id={`next-up${suffix}-${league.id}`}
                                  heading="Next up"
                                  date={comingOwn}
                                  games={gamesOfLeague(getGames({ date: comingOwn }), league.id)}
                                  linkLabel="All games"
                                />
                              ) : null}
                              {!lastOwn && !comingOwn ? <p className="sx-empty">{`No ${league.shortName} games this season.`}</p> : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                : null}
            </>
          ) : (
            regions.map((region, i) => (
              <Fragment key={region.id}>
                {/* The NorCal vs SoCal games sit between the two regions, in both regions' views. */}
                {i === 1 && between.length > 0 ? (
                  <section id="between-regions" data-scope="none" aria-labelledby="between-regions-heading" className="mt-4">
                    <SectionHeader
                      strip
                      id="between-regions-heading"
                      kicker="NorCal vs SoCal"
                      meta={`${between.length} ${gameWord(between.length)}`}
                    />
                    <GameList games={between} className="[&>li:has([data-pinned])]:order-first" />
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
                  leagues={leagues.filter((league) => league.region === region.id)}
                  dayGames={games}
                  nextDate={region.games.length === 0 ? nextIn(region.id) : null}
                  leagueDays={(league) => {
                    const days = leagueDates(league);
                    return { last: [...days].reverse().find((d) => d < date) ?? null, next: days.find((d) => d > date) ?? null };
                  }}
                />
              </Fragment>
            ))
          )}

          {/* JV last of the games: the same schools' other teams, never mixed into the varsity
              groups above or their counts. One block per region (`#jv`, `#jv-socal`), each scoped to
              it and omitted when the region has no JV game that day. When both render (no
              JavaScript), each names its region, so the two headings differ. */}
          {jvBlocks.map((block) => (
            <section
              key={block.region}
              id={`jv${block.idSuffix}`}
              data-region-scope={block.region}
              aria-labelledby={`jv${block.idSuffix}-heading`}
              className="sx-section"
            >
              <SectionHeader
                id={`jv${block.idSuffix}-heading`}
                kicker="JV games"
                meta={jvBlocks.length > 1 ? block.shortName : undefined}
              />
              <JvDayGames view={block.view} />
            </section>
          ))}

          {/* Today: the latest results and the next games are one obvious step away even for a
              reader who does not use the date bar. */}
          {isToday && !nothing
            ? REGIONS.map((region) => {
                /* Each region steps over ITS OWN game days, as the date bar does: a NorCal reader is
                   never offered a day that has only SoCal games. */
                const scoped = REGIONS.length > 1;
                const count = (d: string) => (scoped ? sideGames(d, region.id).length : getGames({ date: d }).length);
                const previous = [...dates].reverse().find((d) => d < date && count(d) > 0) ?? null;
                const next = dates.find((d) => d > date && count(d) > 0) ?? null;
                if (!previous && !next) return null;
                return (
                  <ul key={region.id} className="sx-linkrow" data-region-scope={scoped ? region.id : undefined}>
                    {previous ? (
                      <li>
                        <Link href={`/scores/${previous}`} prefetch={false} className="sx-action">
                          {`${dayWords(previous)}: ${plural(count(previous), 'result')}`}
                        </Link>
                      </li>
                    ) : null}
                    {next ? (
                      <li>
                        <Link href={`/scores/${next}`} prefetch={false} className="sx-action">
                          {`${dayWords(next)}: ${plural(count(next), 'game')}`}
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                );
              })
            : null}
        </div>

        <ScoreRail />
      </div>
    </div>
  );
}

export default ScoreDay;
