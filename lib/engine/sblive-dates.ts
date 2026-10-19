/**
 * si.com dates for a game built from a si.com row alone (a backfilled varsity game, a si.com-only JV
 * game): si.com's instant as our naive local timestamp and UTC instant. Pure.
 */

import { toLocalTimestamp } from '@/lib/shared/dates';

/**
 * si.com's instant → our naive local timestamp and UTC instant; 16:00 local when si.com gives no time.
 * lib/backfill.ts builds a si.com-only varsity game with it, and lib/engine/jv/merge.ts a si.com-only JV game
 * the same way.
 */
export function datesOf(row: { dateIso: string; dateKey: string }): { dateLocal: string; dateUtc: string; dateKey: string; isTimeTba: boolean } {
  const hasTime = /T\d{2}:\d{2}/.test(row.dateIso);
  const instant = hasTime ? new Date(row.dateIso) : null;
  if (instant && !Number.isNaN(instant.getTime())) {
    const dateUtc = instant.toISOString().replace(/\.000Z$/, 'Z');
    const dateLocal = toLocalTimestamp(dateUtc);
    return { dateLocal, dateUtc, dateKey: dateLocal.slice(0, 10), isTimeTba: false };
  }
  const dateLocal = `${row.dateKey}T16:00:00`;
  // Pacific time is UTC-7 (PDT) or UTC-8 (PST); take whichever round-trips to 16:00 local.
  const dateUtc =
    [7, 8]
      .map((h) => new Date(Date.UTC(...ymd(row.dateKey), 16 + h)).toISOString().replace(/\.000Z$/, 'Z'))
      .find((iso) => toLocalTimestamp(iso) === dateLocal) ?? `${row.dateKey}T23:00:00Z`;
  return { dateLocal, dateUtc, dateKey: row.dateKey, isTimeTba: true };
}

function ymd(dateKey: string): [number, number, number] {
  const [y, m, d] = dateKey.split('-').map(Number);
  return [y, m - 1, d];
}
