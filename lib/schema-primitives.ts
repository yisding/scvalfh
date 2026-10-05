/**
 * The validation primitives every data file's contract shares: a lower-case id, a YYYY-MM-DD date
 * key, an http(s) or https URL bound for an `href`, the strict calendar-day and https checks, and the
 * one way a loader (and the fetch scripts' assembled-file check) reports a schema failure (the first
 * ten issues, each as `path: message`).
 *
 * One declaration each, so a dataset's validation messages and strictness never depend on which
 * file declared it: lib/snapshot-schema.ts, lib/rosters-schema.ts, lib/player-stats-schema.ts,
 * lib/clubs-schema.ts, lib/commits-schema.ts, lib/history-schema.ts, lib/prior-season-schema.ts and
 * lib/official/schema.ts all import from here. A schema that deliberately differs keeps its own
 * declaration (commits' and clubs' calendar-strict `asOf` shapes, their https-without-social-media
 * URLs). SLUG_PATTERN and DATE_PATTERN are plain RegExps for the config and registry asserts
 * (lib/leagues.ts, lib/teams.ts), which use no zod schema.
 *
 * zod is the only runtime import, so any contract can take these without a dependency cycle.
 */

import { z } from 'zod';

/** A lower-case id: words of a-z and 0-9 joined by single hyphens (`los-altos`, `scval-de-anza`). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A date key written YYYY-MM-DD. The shape only: "2026-02-30" passes (isCalendarDate refuses it). */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** League, division, slug and other ids: validated strings; membership is checked by each contract. */
export const slugId = z.string().regex(SLUG_PATTERN, 'expected a lower-case id');

/** A date key, YYYY-MM-DD (shape only, as DATE_PATTERN). */
export const dateKey = z.string().regex(DATE_PATTERN, 'expected YYYY-MM-DD');

/**
 * Every URL in a data file that ends up in an `href`.
 *
 * All of them are third-party strings — `calculatedFields.canonicalUrl`, `nfhsStreamUrl` and
 * `goFanUrl` straight out of the MaxPreps JSON, the SBLive page links, and the standings-PDF href
 * scraped out of scval.com's HTML — and React does NOT filter a URL scheme, so a `javascript:` or
 * `data:` value from upstream would be emitted verbatim into a clickable link on a prerendered page.
 * The scheme check belongs at the same chokepoint that refuses a 0-0 non-final: it is the one place
 * the whole snapshot has to pass through. `lib/normalize.ts` drops a non-conforming URL to null with
 * a warning rather than failing the whole run over one bad row.
 */
export const httpUrl = z
  .string()
  .refine((v) => /^https?:\/\/\S+$/i.test(v), 'expected an http(s) URL');

/** An http(s) URL (httpUrl) whose scheme is https. */
export const httpsUrl = httpUrl.refine((v) => v.startsWith('https://'), 'expected an https URL');

/** Parses as a URL, and the scheme is https: these end up in an href. */
export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** A real calendar day, YYYY-MM-DD (no 2026-02-30). */
export function isCalendarDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** A schema failure's first ten issues, one `  path: message` line each (`(root)` for an empty path). */
export function formatIssues(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>): string {
  return issues
    .slice(0, 10)
    .map((i) => `  ${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

/** Throws `<what> failed validation:` and the first ten issues (formatIssues). */
export function failValidation(
  what: string,
  issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>,
): never {
  throw new Error(`${what} failed validation:\n${formatIssues(issues)}`);
}
