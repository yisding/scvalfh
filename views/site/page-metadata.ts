/**
 * The `Metadata` of a route, built once: the title, the description, the canonical and the
 * `openGraph` block that every `app/**` page used to spell out by hand (twenty definitions, ten
 * `export const metadata` and ten `generateMetadata`). Nothing here renders; a route calls
 * {@link pageMetadata} for the page it found and {@link missingMetadata} for a param it did not.
 */

import type { Metadata } from 'next';

import { OG_BASE, ROOT_OG_IMAGE } from '@/views/site/site';

type OpenGraph = NonNullable<Metadata['openGraph']>;

export interface PageMetadataInput {
  /**
   * The page's own path (`/teams`, `/scores/2026-09-24`); it is the canonical and og:url. `null` for
   * a page that has neither: the 404 page, and the superseded-game stub, whose canonical is the
   * MaxPreps game's ({@link PageMetadataInput.canonical}).
   */
  path: string | null;
  /** Where search engines should index this page instead of `path`: the superseded stub's target. */
  canonical?: string;
  /** The `<title>`: a string (the layout's template adds the site name) or `{ absolute }` when the page's own words already name the sport. */
  title: Metadata['title'];
  description?: string;
  /**
   * og:title: the page's own words, never the templated `<title>`. It carries no site-name suffix
   * (og:site_name names the site on every page), and every page states it: a page that left
   * `openGraph.title` out would inherit the templated `<title>` on the Next build and not on vinext,
   * which is how the suffix once came and went page by page (views/site/site.ts OG_BASE).
   */
  ogTitle: string;
  /** og:description, only where the page states one (the descriptions of /game, /scores, /standings, /schedule, /playoffs ...); most pages leave it to the `<meta name="description">`. */
  ogDescription?: string;
  /** og:type when it is not the site's `website`: a single game is an `article`. */
  ogType?: 'article';
  /**
   * Whose card the page shows. `'root'`: the page has NO `opengraph-image.tsx` in its own segment, so
   * it names the site's root card (ROOT_OG_IMAGE). `'own'`: its segment has an `opengraph-image.tsx`,
   * and naming the root card would swap that file-based image for the generic one (OG_BASE and
   * ROOT_OG_IMAGE explain why). tests/app/page-metadata.test.ts checks the choice against the
   * filesystem for every route.
   */
  card: 'root' | 'own';
}

/**
 * Next REPLACES the whole `openGraph` object at the nearest segment that declares one, so every page
 * states the shared fields again (OG_BASE) and then what is its own.
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const { path, canonical, title, description, ogTitle, ogDescription, ogType, card } = input;
  const canonicalUrl = canonical ?? path;
  const openGraph: OpenGraph = {
    ...OG_BASE,
    ...(card === 'root' ? ROOT_OG_IMAGE : {}),
    ...(ogType ? { type: ogType } : {}),
    title: ogTitle,
    ...(ogDescription ? { description: ogDescription } : {}),
    ...(path ? { url: path } : {}),
  };
  return {
    title,
    ...(description ? { description } : {}),
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    openGraph,
  };
}

/**
 * The metadata of a dynamic route's param that names nothing (`/teams/nope`): a title and nothing
 * else, because the page itself 404s and a metadata pass must not cost an unknown param anything.
 * `extra` carries what the one route that needs more says (the game page's `robots: noindex`).
 */
export function missingMetadata(title: string, extra: Pick<Metadata, 'robots'> = {}): Metadata {
  return { title, ...extra };
}
