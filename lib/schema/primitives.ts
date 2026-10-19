/**
 * The validation primitives every data file's contract shares: a lower-case id, a YYYY-MM-DD date
 * key, an http(s) or https URL bound for an `href`, the strict calendar-day and https checks, and the
 * one way a loader (and the fetch scripts' assembled-file check) reports a schema failure (the first
 * ten issues, each as `path: message`), and the one way a cross-field check adds its issue (`customIssue`).
 *
 * One declaration each, so a dataset's validation messages and strictness never depend on which
 * file declared it: lib/schema/snapshot.ts, lib/schema/rosters.ts, lib/schema/player-stats.ts,
 * lib/schema/clubs.ts, lib/schema/commits.ts, lib/schema/history.ts, lib/schema/prior-season.ts and
 * lib/official/bundle.ts all import from here. Two companions hold what is not general: the
 * registry-bound ones (a registry team slug, the team count) in lib/schema/registry-primitives.ts,
 * and the research files' calendar-strict day, social-media-free https URL and host list in
 * lib/schema/source-url.ts. The plain RegExps and checks under them (SLUG_PATTERN, DATE_PATTERN, isCalendarDate,
 * isHttpsUrl) live in lib/shared/patterns.ts, where the config and registry asserts (lib/config/leagues.ts,
 * lib/registry/teams.ts), which use no zod schema, take them without loading zod.
 *
 * zod and those patterns are the only runtime imports, so any contract can take these without a
 * dependency cycle.
 */

import { z } from 'zod';

import { DATE_PATTERN, SLUG_PATTERN } from '@/lib/shared/patterns';

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
 * the whole snapshot has to pass through. `lib/pipeline/reconcile/normalize.ts` drops a non-conforming URL to null with
 * a warning rather than failing the whole run over one bad row.
 */
export const httpUrl = z
  .string()
  .refine((v) => /^https?:\/\/\S+$/i.test(v), 'expected an http(s) URL');

/** An http(s) URL (httpUrl) whose scheme is https. */
export const httpsUrl = httpUrl.refine((v) => v.startsWith('https://'), 'expected an https URL');

/** A cross-field check's failure: a `custom` issue at `path` (the `ctx` a `superRefine` or `.check` hands over). */
export function customIssue(ctx: z.RefinementCtx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** How `describeIssues` renders a list of schema issues. */
export interface DescribeIssuesOptions {
  /** Only the first `limit` issues are described. */
  limit: number;
  /** What an empty path reads as, e.g. '(root)' or '(row)'. */
  empty: string;
  /** Between issues. */
  separator: string;
  /** In front of every issue. Default none. */
  indent?: string;
  /** In front of the whole description. Default none. */
  prefix?: string;
  /** Between the segments of one issue's path. Default '.'. */
  pathJoin?: string;
}

/**
 * The one way a zod failure is put into words: the first `limit` issues, each `path: message`, so the
 * loaders, the fetch scripts and the pipeline's drift reports differ only in the parameters they pass
 * (formatIssues, lib/pipeline/fetch-scope.ts describeRowIssues, lib/pipeline/read.ts parseJsonBody,
 * lib/sources/maxpreps/client.ts and player-stats.ts, lib/pipeline/corpus.ts), never in the code.
 */
export function describeIssues(
  issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>,
  { limit, empty, separator, indent = '', prefix = '', pathJoin = '.' }: DescribeIssuesOptions,
): string {
  return (
    prefix +
    issues
      .slice(0, limit)
      .map((i) => `${indent}${i.path.map(String).join(pathJoin) || empty}: ${i.message}`)
      .join(separator)
  );
}

/** A schema failure's first ten issues, one `  path: message` line each (`(root)` for an empty path). */
export function formatIssues(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>): string {
  return describeIssues(issues, { limit: 10, empty: '(root)', separator: '\n', indent: '  ' });
}

/** Throws `<what> failed validation:` and the first ten issues (formatIssues). */
export function failValidation(
  what: string,
  issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>,
): never {
  throw new Error(`${what} failed validation:\n${formatIssues(issues)}`);
}
