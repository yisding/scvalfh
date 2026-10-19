/**
 * NOT a module to import: the code lives in views/playoffs/tournament-route.ts. This file
 * re-exports only the names the metadata image route still imports through its relative specifier:
 * app/playoffs/[league]/opengraph-image.tsx. (`tournamentLeague` is the route module's
 * `tournamentParam` under the name that file still calls.)
 *
 * Next prints a content hash of each metadata image file's OWN source into the URL every page
 * carries (`og:image` …/opengraph-image?<hash>, `<link rel="icon" href="/icon?<hash>">`), so
 * repointing those imports would change the HTML of every page under those routes. The files keep
 * their bytes, and this module keeps their specifier resolving, until the change that rewrites
 * those routes anyway deletes it. eslint.config.mjs refuses any other import of it.
 */

export { tournamentParam as tournamentLeague, tournamentStaticParams } from '@/views/playoffs/tournament-route';
