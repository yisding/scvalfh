import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/components/layout/site-url';
import { getGameDates, getFetchedAt, getSnapshot, getTeams } from '@/lib/data';

/**
 * /sitemap.xml — every route family in DESIGN §1.1: the ten static pages, 15 team pages, one page
 * per date with a contest (~50) and one per contest (~158).
 *
 * `lastModified` is the snapshot stamp, never `Date.now()`, so a rebuild with unchanged data does
 * not churn every entry's date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(getFetchedAt());
  const url = (path: string) => `${SITE_URL}${path}`;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url('/'), lastModified, changeFrequency: 'daily', priority: 1 },
    { url: url('/standings'), lastModified, changeFrequency: 'daily', priority: 0.9 },
    { url: url('/schedule'), lastModified, changeFrequency: 'daily', priority: 0.8 },
    { url: url('/teams'), lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/playoffs'), lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/history/2025-26'), lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/about'), lastModified, changeFrequency: 'monthly', priority: 0.3 },
  ];

  const teamRoutes: MetadataRoute.Sitemap = getTeams().map((team) => ({
    url: url(`/teams/${team.slug}`),
    lastModified,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  const dateRoutes: MetadataRoute.Sitemap = getGameDates().map((date) => ({
    url: url(`/scores/${date}`),
    lastModified,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const gameRoutes: MetadataRoute.Sitemap = getSnapshot().games.map((game) => ({
    url: url(`/game/${game.contestId}`),
    lastModified,
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return [...staticRoutes, ...teamRoutes, ...dateRoutes, ...gameRoutes];
}
