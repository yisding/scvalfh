/**
 * The `/clubs/[slug]` params (contract: views/site/route-contract.ts): which slugs the route
 * prerenders (every club of data/clubs.json, in its display order) and the club one of them names.
 * The page and the sitemap list the same slugs.
 */

import { getClub, getClubSlugs } from '@/lib/datasets/clubs';
import type { Club } from '@/lib/schema/clubs';
import type { StaticParams } from '@/views/site/route-contract';

/** One param per club, in display order: the fullest club page is listed first. */
export function clubStaticParams(): StaticParams<'slug'> {
  return getClubSlugs().map((slug) => ({ slug }));
}

/** The club a URL segment names, or null for a slug data/clubs.json does not hold. */
export function clubParam(raw: string): Club | null {
  return getClub(raw) ?? null;
}
