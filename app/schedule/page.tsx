import type { Metadata } from 'next';

import LeagueJumpLinks from '../../components/layout/LeagueJumpLinks';
import { RegionSwitcher } from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE, coveredLeagueWords } from '../../components/layout/site';
import ScheduleIndex from '../../components/schedule/ScheduleIndex';
import { countGames } from '../../components/schedule/filter-data';
import { buildScheduleIndex } from '../../components/schedule/schedule-view';
import { getGames, getLeagueSummaries, getTeamBySlug, getToday } from '../../lib/data';
import { plural } from '../../lib/format';
import { SEASON_DISPLAY } from '../../lib/season';

/**
 * `/schedule` — "What's on across the leagues?" (SPEC §8.1, §10.4): a LIGHT index. One page of
 * every league's season would be several megabytes, so each league's full, filterable season is
 * `/schedule/<league>`, and this page holds the league cards, the last and next three game days
 * grouped by league, and an index of every game day.
 *
 * Old links keep working with no JavaScript: `/schedule#2026-09-24` lands on that day's index row
 * (`id="2026-09-24"`), which links `/scores/2026-09-24`. The cards, Recent and Next are per region
 * (DESIGN-socal §2.4, components/schedule/ScheduleIndex.tsx); the day index is one list.
 *
 * Static: no search params; "today" is the snapshot's own Pacific day, never `Date.now()`.
 */
function indexData() {
  const leagues = getLeagueSummaries();
  return {
    leagues,
    index: buildScheduleIndex({
      games: getGames(),
      leagues,
      leagueOf: (slug) => getTeamBySlug(slug)?.league,
      today: getToday(),
    }),
  };
}

export function generateMetadata(): Metadata {
  const counts = countGames(getGames());
  const list = coveredLeagueWords();
  const description = `${counts.total} girls varsity field hockey contests in ${list} for ${SEASON_DISPLAY}: ${plural(counts.final, 'final score')}, ${counts.upcoming} still to come. Each league's full schedule, plus every game day.`;
  return {
    title: 'Schedule & results',
    description,
    alternates: { canonical: '/schedule' },
    openGraph: {
      ...OG_BASE,
      ...ROOT_OG_IMAGE,
      url: '/schedule',
      title: 'Schedule & results — every league',
      description,
    },
  };
}

export default function SchedulePage() {
  const { leagues, index } = indexData();
  return (
    <div className="pb-section-lg">
      <PageHeader
        title="Schedule"
        description="Every league’s season, game by game: pick a league for its full schedule and filters, or a day for every game on it. All times Pacific."
      />

      {/* The region control, its own row under the header (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* Jump links: shown before paint only for the remembered league (league-scope CSS). */}
      <LeagueJumpLinks leagues={leagues} />

      <ScheduleIndex {...index} />
    </div>
  );
}
