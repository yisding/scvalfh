import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/components/layout/site-url';
import { getClubSlugs, getClubsFile } from '@/lib/clubs';
import {
  getFetchedAt,
  getGameDates,
  getGames,
  getLeagueIds,
  getTeams,
  getTournamentLeagueIds,
} from '@/lib/data';
import { gameHref } from '@/lib/game-id';

/**
 * /sitemap.xml — every route family (SPEC §8.1): the fixed pages, `/standings/<id>` and
 * `/schedule/<id>` per league, `/playoffs/<id>` per league-tournament league, the 43 team pages,
 * `/clubs/<slug>` per club of data/clubs.json (DESIGN §17.1), one page per date with a contest, and
 * one per game. The clubs come in lib/clubs.ts' display order, so the first club page listed is the
 * fullest one (scripts/a11y-axe.mjs samples it).
 *
 * Game URLs go through `gameHref`, so a si.com-only game (`sblive:<id>`) is listed at its real
 * route (`/game/sblive-<id>`). The `supersededGames` stub pages are NOT listed: they are not in
 * `games` (they exist only to keep an old link resolving, with rel=canonical to the MaxPreps game).
 *
 * `lastModified` is the snapshot stamp, never `Date.now()`, so a rebuild with unchanged data does
 * not churn every entry's date. The clubs pages take data/clubs.json's own `capturedAt` instead:
 * they are hand research, not part of the twice-daily snapshot, and change only with a new sweep.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(getFetchedAt());
  const clubsStamp = new Date(getClubsFile().capturedAt);
  const url = (path: string) => `${SITE_URL}${path}`;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url('/'), lastModified, changeFrequency: 'daily', priority: 1 },
    { url: url('/standings'), lastModified, changeFrequency: 'daily', priority: 0.9 },
    { url: url('/schedule'), lastModified, changeFrequency: 'daily', priority: 0.8 },
    { url: url('/teams'), lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/playoffs'), lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/leaders'), lastModified, changeFrequency: 'daily', priority: 0.6 },
    { url: url('/history/2025-26'), lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/about'), lastModified, changeFrequency: 'monthly', priority: 0.3 },
    { url: url('/clubs'), lastModified: clubsStamp, changeFrequency: 'monthly', priority: 0.4 },
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
    lastModified,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const gameRoutes: MetadataRoute.Sitemap = getGames().map((game) => ({
    url: url(gameHref(game.contestId)),
    lastModified,
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
