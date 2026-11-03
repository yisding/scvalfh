import EmptyState from '../ui/EmptyState';
import SectionHeader from '../ui/SectionHeader';
import { gameWord } from '../words/plural';
import { shortNameOf } from '../words/team-short-name';
import type { LeagueSummary } from '../../lib/data';
import { shortDate } from '../../lib/format';
import type { Game, OfficialFixture } from '../../lib/types';

import GameList from './GameList';
import OfficialFixtures from './OfficialFixtures';
import type { DayRegion } from './day-summary';

/** One league's unreported official fixtures of the day (the day page's `fixtureLeagues`). */
interface FixtureBlock {
  league: LeagueSummary;
  rows: OfficialFixture[];
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
    <p className="sx-inset mt-stack mb-0 max-w-prose">
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
 * One region's block on `/scores/[date]` (DESIGN §24.3): `<section id="norcal|socal" data-region-scope>` under an h2 naming
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
export default function ScoresRegionBlock({
  region,
  firstRegion,
  betweenCount,
  jvCount,
  date,
  today,
  fixtureLeagues,
}: {
  region: DayRegion;
  /**
   * The page's first region block (NorCal's): it takes the top margin, and the NorCal vs SoCal block sits
   * below it (above the second).
   */
  firstRegion: boolean;
  /** The day's NorCal vs SoCal games, for the empty sentence. */
  betweenCount: number;
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
  return (
    <section
      id={region.id}
      data-region-scope={region.id}
      aria-labelledby={headingId}
      className={firstRegion ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
    >
      <SectionHeader id={headingId} kicker={region.name} />

      {region.groups.length >= 2 ? (
        <nav
          aria-label={region.idSuffix === '' ? 'Leagues on this day' : `${region.name} leagues on this day`}
          className="sx-print-hide mt-4 flex flex-wrap gap-2"
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
            {/* A postseason group links its place on /playoffs ('CCS Division 2 · 4' → its division's bracket). */}
            <SectionHeader
              as="h3"
              id={`${group.id}-heading`}
              kicker={group.kicker}
              action={group.bracket ? { href: group.bracket.href, label: group.bracket.label } : undefined}
            />
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
