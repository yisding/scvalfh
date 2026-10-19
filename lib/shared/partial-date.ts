/**
 * The one grammar of a partial date, the shapes the hand-researched files write a date in
 * (data/clubs.json's and data/commits.json's `asOf`): a day, a month, a year, a season ("2025-26":
 * the second year is the first + 1) or a range of years ("2015-2018"). The research contracts
 * (lib/schema/clubs.ts `isAsOf`, lib/schema/commits.ts `isCommitDate`) and the formatter that words
 * one (lib/format/dates.ts `partialDate`) all read a string through `partialDateKind`, so what a
 * schema accepts and what a page can print never drift apart.
 *
 * `YYYY-MM` is a month when MM is 01-12 and a season otherwise (the +1 rule), the order the
 * contracts read it in; the two can only collide before 2012. The `day` branch is the SHAPE of a
 * day (month 01-12, day 01-31) and not a calendar check: "2026-02-30" is a `day` here, which is all
 * rendering needs; a contract that must refuse it adds `isCalendarDate` (lib/shared/patterns.ts).
 *
 * Pure string work with no imports, so it is client-safe.
 */

export type PartialDateKind = 'day' | 'month' | 'year' | 'season' | 'range';

/** Which of the five shapes `value` is, or null for anything else ("2025-27", "2025/26", ""). */
export function partialDateKind(value: string): PartialDateKind | null {
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return 'day';
  if (/^\d{4}$/.test(value)) return 'year';
  const short = /^(\d{4})-(\d{2})$/.exec(value);
  if (short) {
    const [year, tail] = [Number(short[1]), Number(short[2])];
    if (tail >= 1 && tail <= 12) return 'month';
    if (tail === (year + 1) % 100) return 'season';
  }
  const range = /^(\d{4})-(\d{4})$/.exec(value);
  if (range && Number(range[1]) <= Number(range[2])) return 'range';
  return null;
}
