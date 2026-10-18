/**
 * The plain string checks the data contracts and the config asserts share: a lower-case id, a
 * YYYY-MM-DD date key, the strict calendar-day check and the https check. RegExps and functions
 * only, no zod: SLUG_PATTERN and DATE_PATTERN are what the config and registry asserts (lib/config/leagues.ts,
 * lib/registry/teams.ts) test with, and lib/schema/primitives.ts builds its zod schemas (slugId, dateKey) and
 * the contracts their refinements on the same declarations, so a check never depends on which side
 * of the zod line it runs on.
 */

/** A lower-case id: words of a-z and 0-9 joined by single hyphens (`los-altos`, `scval-de-anza`). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A date key written YYYY-MM-DD. The shape only: "2026-02-30" passes (isCalendarDate refuses it). */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
