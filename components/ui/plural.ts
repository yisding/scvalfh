/**
 * NOT a module to import: `plural`, `gameWord` and `formStripName` live in lib/format/words.ts. This
 * file re-exports only the two names app/scores/[date]/opengraph-image.tsx still imports through its
 * relative `../../../components/ui/plural` specifier: Next prints a content hash of each metadata
 * image file's OWN source into the URL every page carries (`og:image` …/opengraph-image?<hash>), so
 * repointing that import would change the HTML of every /scores page. The route keeps its bytes, and
 * this module keeps its specifier resolving, until the change that rewrites the route anyway deletes
 * it. eslint.config.mjs refuses any other import of it.
 */

export { gameWord, plural } from '@/lib/format/words';
