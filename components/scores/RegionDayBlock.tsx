import GameList from '@/components/schedule/GameList';
import OfficialFixtures from '@/components/schedule/OfficialFixtures';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeader from '@/components/ui/SectionHeader';
import type { RegionBlockData } from '@/views/scores/scores-view';

import MovedNote from './MovedNote';

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
 * A region with no game that day keeps its block with one sentence (`empty`, worded by
 * `regionEmptySentence` in views/scores/scores-view.ts) so a reader in that region sees what is true
 * rather than an empty page.
 */
export default function RegionDayBlock({
  region,
  first,
  moved,
  fixtureLeagues,
  empty,
  date,
  today,
}: Pick<RegionBlockData, 'region' | 'first' | 'moved' | 'fixtureLeagues' | 'empty'> & {
  date: string;
  today: string;
}) {
  const headingId = `${region.id}-heading`;
  const labelledBy = (groupId: string) =>
    region.idSuffix === '' ? `${groupId}-heading` : `${groupId}-heading ${headingId}`;
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
            <SectionHeader as="h3" id={`${group.id}-heading`} kicker={group.kicker} />
            {/* Two or more cards fill the row, so they end where the pager, the fixtures card
                and the disclosure below end; a lone card stays card-sized rather than 1200px wide. */}
            <GameList games={group.games} tracks={group.games.length > 1 ? 'fit' : 'fill'} />
          </section>
        ))
      )}

      <MovedNote moved={moved} />

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
