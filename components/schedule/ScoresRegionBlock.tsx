import Link from 'next/link';

import SectionHeader from '../ui/SectionHeader';
import { gameWord } from '../words/plural';
import { shortNameOf } from '../words/team-short-name';
import type { LeagueSummary } from '../../lib/data';
import { monthDay, shortDate } from '../../lib/format';
import type { Game, OfficialFixture } from '../../lib/types';

import GameList from './GameList';
import OfficialFixtures from './OfficialFixtures';
import { dayGroups, gamesOfLeague, groupsByStart, type DayGroup, type DayRegion } from './day-summary';

/** One league's unreported official fixtures of the day (the day page's `fixtureLeagues`). */
interface FixtureBlock {
  league: LeagueSummary;
  rows: OfficialFixture[];
}

/**
 * The reader's own team first (DESIGN §33): the pin lives in the browser, which stamps `data-pinned`
 * on the team's side of its row before paint (components/prefs/pinned-team-script.ts), so the group
 * that holds that row, and the row within it, are moved first with `order`. Everything else stays in
 * start-time order. These are utilities because the rule belongs to this page alone.
 */
const PINNED_GROUP_FIRST = 'flex flex-col gap-4 [&>*:has([data-pinned])]:order-first';
const PINNED_GAME_FIRST = '[&>li:has([data-pinned])]:order-first';

/** 'Sat, Nov 14' */
export function dayWords(date: string): string {
  return `${shortDate(date).split(' ')[0]}, ${monthDay(date)}`;
}

/**
 * `game.official.scheduledDate` is the date on the league's official schedule. When it differs from
 * the date the game is actually on, the game moved — worth one sentence, because a parent looking at
 * the printed schedule will otherwise think we have the wrong day. One sentence per block, over that
 * block's games, so a region's note never names the other region's games.
 */
export function MovedNote({ games, date }: { games: readonly Game[]; date: string }) {
  const moved = games.filter((game) => game.official && game.official.scheduledDate !== date);
  if (moved.length === 0) return null;
  return (
    <p className="sx-note">
      {moved.length === 1 ? 'One game here was moved' : `${moved.length} games here were moved`}{' '}
      from the date on the league&rsquo;s official schedule:{' '}
      {moved
        .map(
          (game) =>
            `${shortNameOf(game.away.slug, game.away.name)} at ${shortNameOf(
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
 * A day's groups as strips and lists (DESIGN §33): per competition or league a strip (its name at the
 * left; the count and, for a playoff group, "Bracket" at the right end) directly over its game rows.
 * `anchors` puts the group ids on the page (`#scval`, `#non-league`): only ONE copy of a day's groups
 * carries them, the every-league one.
 */
export function DayGroups({
  groups,
  anchors = false,
  labelledBy,
  limit,
}: {
  groups: readonly DayGroup[];
  anchors?: boolean;
  /** The `aria-labelledby` of a group's section, from its id. */
  labelledBy?: (groupId: string) => string;
  /** At most this many rows per group (the today-only fallback sections). */
  limit?: number;
}) {
  return (
    <div className={PINNED_GROUP_FIRST}>
      {groupsByStart(groups).map((group) => {
        const games = limit === undefined ? group.games : group.games.slice(0, limit);
        const head = (
          <SectionHeader
            strip
            id={anchors ? `${group.id}-heading` : undefined}
            kicker={group.name}
            meta={group.round ?? `${group.games.length} ${gameWord(group.games.length)}`}
            action={group.bracket ? { href: group.bracket.href, label: 'Bracket' } : undefined}
          />
        );
        const list = <GameList games={games} className={PINNED_GAME_FIRST} />;
        return anchors ? (
          <section key={group.id} id={group.id} aria-labelledby={labelledBy ? labelledBy(group.id) : `${group.id}-heading`}>
            {head}
            {list}
          </section>
        ) : (
          <div key={group.id}>
            {head}
            {list}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One region's block on a score day (DESIGN §24.3, §33): `<section id="norcal|socal" data-region-scope>`,
 * holding the day's groups once for every league (`data-scope="none"`, the All tab; it carries the
 * anchors `#latest-every-league`, `#scval`, `#non-league`, SoCal's repeats suffixed `-socal`) and once
 * per league of the region (`data-scope="<league>"`: the games with a side in that league, the day's
 * NorCal vs SoCal games included). The scope stylesheet shows one of them, so no game is seen twice.
 *
 * The region's name is its h2. The region switch already says it, so with JavaScript the heading is
 * for screen readers only; without it both regions render and the heading is what tells them apart.
 * A SoCal group is labelled by its heading AND the region's, so two "Non-league" sections never share
 * an accessible name (axe landmark-unique).
 *
 * A region with no game that day keeps its block with one sentence, so a reader in that region sees what
 * is true rather than an empty page: "No Southern California games on this day." When the day's only
 * games with a side in the region are NorCal vs SoCal it adds "besides the NorCal vs SoCal game above",
 * and when the region has JV games that day it says "varsity" and points at them, because "no games"
 * above a list of that region's JV games would not be true. For the same reason a region whose leagues'
 * official schedules list a game no source has says "No source lists …" and points at it. The sentence
 * ends with the region's next game day, linked.
 */
export default function ScoresRegionBlock({
  region,
  firstRegion,
  betweenCount,
  jvCount,
  date,
  today,
  fixtureLeagues,
  leagues,
  dayGames,
  nextDate,
  leagueDays,
}: {
  region: DayRegion;
  /** The page's first region block (NorCal's): the NorCal vs SoCal block sits below it (above the second). */
  firstRegion: boolean;
  /** The day's NorCal vs SoCal games, for the empty sentence. */
  betweenCount: number;
  /** The region's JV games that day (its `#jv` block below), for the empty sentence. */
  jvCount: number;
  date: string;
  today: string;
  fixtureLeagues: readonly FixtureBlock[];
  /** The region's leagues: one league-scoped copy of the day's groups each. */
  leagues: readonly LeagueSummary[];
  /** Every game of the day the list shows (both regions'), for the league slices. */
  dayGames: readonly Game[];
  /** The region's next game day after this one, or null. */
  nextDate: string | null;
  /** A league's game day before and after this one, so its empty line is not a dead end. */
  leagueDays?: (league: LeagueSummary['id']) => { last: string | null; next: string | null };
}) {
  const headingId = `${region.id}-heading`;
  const labelledBy = (groupId: string) =>
    region.idSuffix === '' ? `${groupId}-heading` : `${groupId}-heading ${headingId}`;
  const besides =
    betweenCount === 0 ? '' : ` besides the NorCal vs SoCal ${gameWord(betweenCount)} ${firstRegion ? 'below' : 'above'}`;
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
  const next = nextDate ? (
    <>
      {' '}
      Next games:{' '}
      <Link href={nextDate === today ? '/' : `/scores/${nextDate}`} prefetch={false} className="sx-link">
        {dayWords(nextDate)}
      </Link>
    </>
  ) : null;
  const dayLink = (label: string, d: string) => (
    <>
      {' '}
      {label}{' '}
      <Link href={d === today ? '/' : `/scores/${d}`} prefetch={false} className="sx-link">
        {dayWords(d)}
      </Link>
      .
    </>
  );
  return (
    <section id={region.id} data-region-scope={region.id} aria-labelledby={headingId} className="sx-section" data-first="">
      <h2 id={headingId} className="[html[data-js]_&]:sr-only">
        {region.name}
      </h2>

      <div data-scope="none" id={`latest-every-league${region.idSuffix}`}>
        {region.games.length === 0 ? (
          <p className="sx-empty">
            {empty}
            {next}
          </p>
        ) : (
          <DayGroups groups={region.groups} anchors labelledBy={labelledBy} />
        )}
      </div>

      {leagues.map((league) => {
        const mine = gamesOfLeague(dayGames, league.id);
        return (
          <div key={league.id} data-scope={league.id}>
            {mine.length === 0 ? (
              <p className="sx-empty">
                {`No ${league.shortName} games on this day.`}
                {(() => {
                  /* The league's own days: its next game day, else its last one (a league whose
                     season is over), never the region's. */
                  const days = leagueDays?.(league.id);
                  if (!days) return next;
                  if (days.next) return dayLink('Next games:', days.next);
                  if (days.last) return dayLink(`Last ${league.shortName} games:`, days.last);
                  return null;
                })()}
              </p>
            ) : (
              <DayGroups groups={dayGroups(mine)} />
            )}
          </div>
        );
      })}

      <MovedNote games={region.games} date={date} />

      {/* Fixtures on a league's official schedule that no source lists, one group per league. A day
          that has not come yet (or is today) heads them as more of the day ("Also on <SHORT>’s
          schedule"), never as a missing result. The date column would repeat the selected day, so
          it goes. */}
      {fixtureLeagues.map(({ league, rows }) => (
        <div key={league.id} className="mt-4">
          <SectionHeader
            strip
            kicker={date >= today ? `Also on ${league.shortName}’s schedule` : `Scheduled by ${league.shortName}, not reported`}
          />
          <OfficialFixtures fixtures={rows} leagueId={league.id} today={today} variant="plain" showDate={false} />
        </div>
      ))}
    </section>
  );
}
