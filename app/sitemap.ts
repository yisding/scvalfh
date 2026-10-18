import type { MetadataRoute } from 'next';

import { SITE_URL } from '../components/layout/site';
import { getClubSlugs, getClubsLastChecked } from '../lib/clubs';
import { getCommitsLastChecked } from '../lib/commits';
import { gamePageInputs, latestContentDate } from '../lib/content-dates';
import { getRosterEnrichment } from '../lib/rosters';
import {
  getFetchedAt,
  getGameDates,
  getGames,
  getLeagueIds,
  getTeams,
  getTournamentLeagueIds,
} from '../lib/data';
import { gameHref } from '../lib/game-id';
import { getHistoryLastChecked } from '../lib/history';
import { getJvFetchedAt, getJvGamesOn } from '../lib/jv';

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
 * date page take the latest MaxPreps stamp of the games they are built from (lib/content-dates.ts:
 * the game, both sides' earlier games and the season series; the day's varsity and JV games), so a
 * September final stops "changing" twice a day. The hubs, the league pages and the team pages
 * (whose standings and Elo rating move with any game in the league) take the snapshot stamp. /jv
 * takes data/jv.json's own `fetchedAt`, and /history/2025-26 the last day its sources were read
 * (`getHistoryLastChecked`): a finished season does not change with the snapshot. The clubs pages take the last day data/clubs.json was checked
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
    { url: url('/jv'), lastModified: new Date(getJvFetchedAt()), changeFrequency: 'daily', priority: 0.5 },
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

  const dateRoutes: MetadataRoute.Sitemap = getGameDates().map((date) => ({
    url: url(`/scores/${date}`),
    lastModified: latestContentDate([...getGames({ date }), ...getJvGamesOn(date)], getFetchedAt()),
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const games = getGames();
  const gameRoutes: MetadataRoute.Sitemap = games.map((game) => ({
    url: url(gameHref(game.contestId)),
    lastModified: latestContentDate(gamePageInputs(game, games), getFetchedAt()),
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
