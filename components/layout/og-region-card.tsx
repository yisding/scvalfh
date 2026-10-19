/**
 * NOT a module to import: the code lives in components/og/RegionCard.tsx. This file re-exports only
 * the names the metadata image routes still import through their relative specifier:
 * app/opengraph-image.tsx and app/standings/opengraph-image.tsx.
 *
 * Next prints a content hash of each metadata image file's OWN source into the URL every page
 * carries (`og:image` …/opengraph-image?<hash>, `<link rel="icon" href="/icon?<hash>">`), so
 * repointing those imports would change the HTML of every page under those routes. The files keep
 * their bytes, and this module keeps their specifier resolving, until the change that rewrites
 * those routes anyway deletes it. eslint.config.mjs refuses any other import of it.
 */

export { RegionCard, rootCardProps, standingsCardProps } from '@/components/og/RegionCard';
