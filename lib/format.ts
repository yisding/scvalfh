/**
 * NOT a module to import: the formatters live in lib/format/ (dates.ts, numbers.ts, words.ts,
 * score.ts) and lib/shared/ (dates.ts, game.ts). This file re-exports only the names the four
 * metadata image routes still import through their relative `../../../lib/format` specifier:
 * app/game/[id]/opengraph-image.tsx, app/playoffs/[league]/opengraph-image.tsx,
 * app/scores/[date]/opengraph-image.tsx and app/teams/[slug]/opengraph-image.tsx.
 *
 * Next prints a content hash of each metadata image file's OWN source into the URL every page
 * carries (`og:image` …/opengraph-image?<hash>), so repointing those imports would change the HTML
 * of every page under those routes. The files keep their bytes, and this module keeps their
 * specifier resolving, until the change that rewrites those routes anyway deletes it.
 * eslint.config.mjs refuses any other import of it.
 */

export { dateWithYear, formatStamp, shortDate, timeOfDayPT } from './format/dates';
export { ordinal, recordString, signedGd, streakString } from './format/numbers';
export { EM_DASH, EN_DASH, listWords } from './format/words';
