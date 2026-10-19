/**
 * The contract every view module and every route-param module meets, in one place, so a dynamic
 * route family reads the same everywhere (a page, its metadata, its OG card and the sitemap).
 *
 * A VIEW module, `views/<area>/<area>-view.ts`, exports `build<Area>View(params)`: it returns a
 * plain, serializable `View` (no JSX, no class instances, nothing a server-to-client boundary
 * would refuse) or `null` when the params name nothing. `null`, never `undefined`: a route that
 * has nothing to show answers `notFound()` (or a "not found" title in `generateMetadata`) on
 * exactly one test, `if (!view)`, and a JSON-serialized view cannot silently turn a missing value
 * into an absent key.
 *
 * A ROUTE module, `views/<area>/<area>-route.ts` (`views/site/league-route.ts` for the two
 * `[league]` families that share it), exports two functions for a dynamic family:
 *   - `<area>StaticParams()` — every param the family prerenders. The page's and the OG card's
 *     `generateStaticParams` both return it, and `app/sitemap.ts` lists the family from it, so the
 *     URLs a page points at, the images behind them and the sitemap cannot disagree.
 *   - `<area>Param(raw)` — the value a raw URL segment names, or `null` for a segment that is not
 *     one of the family's params. Every guard (`generateMetadata`, the page, the view builder, the
 *     OG card) calls it BEFORE any accessor that can throw for an unknown id.
 *
 * Route files keep the two Next.js declarations literal, because Next detects segment config only
 * from them (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/dynamicParams.md):
 * `export const dynamicParams = false` and an in-file `export function generateStaticParams() {
 * return <area>StaticParams(); }`. Neither can be re-exported from here.
 */

/** The prerendered params of a family with one dynamic segment named `K`: `{ league: 'mcal' }[]`. */
export type StaticParams<K extends string> = Array<Record<K, string>>;

/** A route module's guard: the value a raw URL segment names, or `null` for a segment that names nothing. */
export type RouteParam<T> = (raw: string) => T | null;

/** A view module's entry: the serializable view for one route's params, or `null` when they name nothing. */
export type ViewBuilder<P, V> = (params: P) => V | null;
