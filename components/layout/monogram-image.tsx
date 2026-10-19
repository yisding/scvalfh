/**
 * NOT a module to import: the code lives in components/og/monogram-image.tsx. This file re-exports
 * only the names the metadata image routes still import through their relative specifier:
 * app/icon.tsx and app/apple-icon.tsx.
 *
 * Next prints a content hash of each metadata image file's OWN source into the URL every page
 * carries (`og:image` …/opengraph-image?<hash>, `<link rel="icon" href="/icon?<hash>">`), so
 * repointing those imports would change the HTML of every page under those routes. The files keep
 * their bytes, and this module keeps their specifier resolving, until the change that rewrites
 * those routes anyway deletes it. eslint.config.mjs refuses any other import of it.
 */

export { monogramImage } from '@/components/og/monogram-image';
