import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/components/layout/site';
import { getClubSlugs, getClubsLastChecked } from '@/lib/clubs';
import { getCommitsLastChecked } from '@/lib/commits';
import {
  gamePageInputs, latestContentDate, removalsForGame, removalsOnDay, scoreDayInputs,
} from '@/lib/engine/content-dates';
import { getRosterEnrichment } from '@/lib/rosters';
import {
  getContentRemovals,
  getFetchedAt,
  getGameDates,
  getGames,
  getLeagueIds,
  getOfficialFixtures,
  getTeams,
  getTournamentLeagueIds,
} from '@/lib/data';
import { getHistoryLastChecked } from '@/lib/history';
import { getJvFetchedAt, getJvGamesOn } from '@/lib/jv';
import { gameHref } from '@/lib/shared/game-id';

/**
 * /sitemap.xml — every route family (SPEC §8.1): the fixed pages, `/standings/<id>` and
 * `/schedule/<id>` per league, `/playoffs/<id>` per league-tournament league, the team pages (one per registry team),
 * `/clubs/<slug>` per club of data/clubs.json (DESIGN §17.1), one page per date with a contest, and
 * one per game. The clubs come in lib/clubs.ts' display order, so the first club page listed is the
 * fullest one (scripts/a11y-axe.mjs samples it).
 *
 * Game URLs go through `gameHref`, so a si.com-only game (`sblive:<id>`) is listed at its real
 * route (`/game/sblive-<id>`). The `supersededGames` stub pages are NOT listed: they are not in
 * `games` (they exist only to keep an old link resolving, with rel=canonical to the MaxPreps game).
 *
 * `lastModified` is never `Date.now()`, so a rebuild with unchanged data does not churn every
 * entry's date, and it is as close to when THAT page's content changed as the data can say, because
 * Google trusts `lastmod` only from a sitemap where it is consistently right. A game page and a
 * date page take the latest content stamp of the games they are built from (lib/engine/content-dates.ts):
 * the pipeline's own `contentChangedAt` where it is set, else MaxPreps' stamp, and of the contests
 * that left them (`contentRemovals`: a deleted or moved game changes the pages it leaves). A game page is built
 * from the game, the sides' games behind the records it prints and the season series; a date page
 * from the day's varsity and JV games and the games behind an upcoming row's records, and a day
 * with an unmatched official fixture takes the snapshot stamp. So a September final stops
 * "changing" twice a day. The hubs, the league pages and the team pages (whose standings and Elo
 * rating move with any game in the league) take the snapshot stamp. /jv takes the later of
 * data/jv.json's `fetchedAt` and the snapshot's, and /history/2025-26 the last day its sources were
 * read (`getHistoryLastChecked`): a finished season does not change with the snapshot. The clubs
 * pages take the last day data/clubs.json was checked
 * instead (`getClubsLastChecked`: its `capturedAt`, or a later club `checkedOn`), as /commits does:
 * they are hand research, not part of the twice-daily snapshot, and change only with a new sweep.
 * /commits takes the last day data/commits.json was checked (`getCommitsLastChecked`: its
 * `capturedAt`, or a later college `checkedOn`) for the same reason (DESIGN §21.4). /recruiting gathers
 * the clubs, the commitments and the roster overlay's recruiting profiles (DESIGN §25), so it takes
 * the latest of the three files' dates.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(getFetchedAt());
  const clubsStamp = new Date(getClubsLastChecked());
  const commitsStamp = new Date(getCommitsLastChecked());
  const recruitingStamp = new Date(
    [getClubsLastChecked(), getCommitsLastChecked(), getRosterEnrichment().capturedAt].sort().at(-1)!,
  );
  const url = (path: string) => `${SITE_URL}${path}`;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url('/'), lastModified, changeFrequency: 'daily', priority: 1 },
    { url: url('/standings'), lastModified, changeFrequency: 'daily', priority: 0.9 },
    { url: url('/schedule'), lastModified, changeFrequency: 'daily', priority: 0.8 },
    { url: url('/teams'), lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/playoffs'), lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/leaders'), lastModified, changeFrequency: 'daily', priority: 0.6 },
    // The later of the JV file and the snapshot: lib/jv.ts classifies the JV games against the varsity
    // snapshot's games and official fixtures, so either can change the page.
    {
      url: url('/jv'),
      lastModified: new Date(Math.max(Date.parse(getJvFetchedAt()), lastModified.getTime())),
      changeFrequency: 'daily',
      priority: 0.5,
    },
    {
      url: url('/history/2025-26'),
      lastModified: new Date(getHistoryLastChecked()),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    { url: url('/about'), lastModified, changeFrequency: 'monthly', priority: 0.3 },
    { url: url('/clubs'), lastModified: clubsStamp, changeFrequency: 'monthly', priority: 0.4 },
    { url: url('/commits'), lastModified: commitsStamp, changeFrequency: 'monthly', priority: 0.4 },
    { url: url('/recruiting'), lastModified: recruitingStamp, changeFrequency: 'monthly', priority: 0.4 },
  ];

  const leagueRoutes: MetadataRoute.Sitemap = getLeagueIds().flatMap((id) => [
    { url: url(`/standings/${id}`), lastModified, changeFrequency: 'daily' as const, priority: 0.9 },
    { url: url(`/schedule/${id}`), lastModified, changeFrequency: 'daily' as const, priority: 0.8 },
  ]);

  const tournamentRoutes: MetadataRoute.Sitemap = getTournamentLeagueIds().map((id) => ({
    url: url(`/playoffs/${id}`),
    lastModified,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const teamRoutes: MetadataRoute.Sitemap = getTeams().map((team) => ({
    url: url(`/teams/${team.slug}`),
    lastModified,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  const clubRoutes: MetadataRoute.Sitemap = getClubSlugs().map((slug) => ({
    url: url(`/clubs/${slug}`),
    lastModified: clubsStamp,
    changeFrequency: 'monthly',
    priority: 0.3,
  }));

  const games = getGames();
  const removals = getContentRemovals();
  // A day page also lists that day's official fixtures no game matched (OfficialFixtures). They
  // carry no stamp of their own, and the official sources are read on every run, so such a day
  // takes the snapshot's: it can change with any fetch.
  const fixtureDays = new Set(getOfficialFixtures().map((f) => f.dateKey));
  const dateRoutes: MetadataRoute.Sitemap = getGameDates().map((date) => ({
    url: url(`/scores/${date}`),
    lastModified: fixtureDays.has(date)
      ? lastModified
      : latestContentDate(
          [...scoreDayInputs(getGames({ date }), games), ...getJvGamesOn(date)],
          getFetchedAt(),
          removalsOnDay(removals, date),
        ),
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const gameRoutes: MetadataRoute.Sitemap = games.map((game) => ({
    url: url(gameHref(game.contestId)),
    lastModified: latestContentDate(gamePageInputs(game, games), getFetchedAt(), removalsForGame(removals, game)),
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return [
    ...staticRoutes,
    ...leagueRoutes,
    ...tournamentRoutes,
    ...teamRoutes,
    ...clubRoutes,
    ...dateRoutes,
    ...gameRoutes,
  ];
}
