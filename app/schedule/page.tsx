import type { Metadata } from 'next';

import LeagueJumpLinks from '../../components/layout/LeagueJumpLinks';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import ScheduleIndex, { buildScheduleIndex } from '../../components/schedule/ScheduleIndex';
import { countGames } from '../../components/schedule/filter-data';
import { getGames, getLeagueSummaries, getTeamBySlug, getToday } from '../../lib/data';
import { listWords } from '../../lib/format';

/**
 * `/schedule` — "What's on across the leagues?" (SPEC §8.1, §10.4): a LIGHT index. One page of
 * every league's season would be several megabytes, so each league's full, filterable season is
 * `/schedule/<league>`, and this page holds the league cards, the last and next three game days
 * grouped by league, and an index of every game day.
 *
 * Old links keep working with no JavaScript: `/schedule#2026-09-24` lands on that day's index row
 * (`id="2026-09-24"`), which links `/scores/2026-09-24`.
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
  const list = listWords(getLeagueSummaries().map((l) => l.shortName));
  const description = `${counts.total} girls varsity field hockey contests in ${list} for Fall 2026: ${counts.final} final, ${counts.upcoming} still to come. Each league's full schedule, plus every game day.`;
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

      {/* Jump links: shown before paint only for the remembered league (league-scope CSS). */}
      <LeagueJumpLinks leagues={leagues} />

      <ScheduleIndex {...index} />
    </div>
  );
}
