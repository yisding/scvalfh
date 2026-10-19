/** Where and how the si.com (ex-SBLive) pages are read: URL builders, game ids and the request options. */

import { SBLIVE_WEB } from '@/lib/config/source-urls';
import { CHROME_USER_AGENT, type HttpClientOptions } from '@/lib/sources/http/client';

export const SBLIVE_HOST = 'https://www.si.com';

export function sbliveTeamGamesUrl(sbliveSlug: string): string {
  return `${SBLIVE_WEB}/teams/${sbliveSlug}/games`;
}

/** The statewide daily scoreboard. `date` is YYYY-MM-DD. */
export function sbliveScoresUrl(date: string): string {
  return `${SBLIVE_WEB}/scores?date=${date}`;
}

/**
 * A si.com game page URL from a payload's `webPath`, or null when the path is not a plain URL path
 * (whitespace, a scheme, a query, anything outside RFC 3986's unreserved set plus `%` and `/`). The result
 * always passes the snapshot schema's httpUrl, so one malformed upstream row can never fail a run.
 */
export function sbliveGameUrl(webPath: string | null | undefined): string | null {
  if (!webPath || !/^\/[A-Za-z0-9._~%/-]+$/.test(webPath)) return null;
  return `${SBLIVE_HOST}/high-school/stats${webPath}`;
}

/**
 * A si.com game id as published in `sblive:<id>` contest ids: digits only, else null. Reads a RAW payload
 * id; `sbliveGameIdOf` (lib/shared/contest-id.ts) reads one back out of a contest id.
 */
export function sbliveRawGameId(id: unknown): string | null {
  const s = String(id ?? '').trim();
  return /^\d+$/.test(s) ? s : null;
}

/**
 * The HTTP options every si.com request uses (LiveTransport). A Chrome-like UA is
 * required — si.com 403s a non-browser agent (SPEC §1.2) — and the requests are spaced and serial:
 * a run reads at most ~23 si.com pages (SPEC §7.7).
 */
export const SBLIVE_HTTP_OPTIONS: Readonly<HttpClientOptions> = Object.freeze({
  userAgent: CHROME_USER_AGENT,
  concurrency: 1,
  spacingMs: 1000,
});
