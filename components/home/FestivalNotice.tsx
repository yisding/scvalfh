import { BUILD_INSTANT } from '../layout/build-instant';
import { SectionHeader } from '../ui/SectionHeader';
import { getFestival, type FestivalTournament } from '../../lib/festival/festival';
import { monthDay } from '../../lib/format';
import { HAS_FESTIVAL } from '../../lib/sports/current';

/**
 * The home page's pointer to the National Hockey Festival (DESIGN §35.8): a section head, "National Hockey
 * Festival", with where and when beside it and one link, "Results and brackets", to /festival. A heading row, not a
 * filled banner: navy is the band's alone and the tint is for group strips (tests/ui/design-rules.test.ts).
 *
 * It is the default (section) face, not a strip, because a strip's right end does not wrap: "Naples, Fla. · Nov
 * 26–28" and the link together are wider than a 320px phone row. In the section face the meta drops under the
 * heading and the link keeps its line.
 *
 * Shown only in field hockey's build (HAS_FESTIVAL) and only while the build instant falls between a week before the
 * first day and three days after the last (festivalNoticeShown): the page is static, so "now" is the build, never
 * the reader's clock, and the twice-daily rebuilds take the notice down on their own.
 */

/** Days before the first day the notice goes up, and after the last that it stays. */
export const NOTICE_DAYS_BEFORE = 7;
export const NOTICE_DAYS_AFTER = 3;

const DAY_MS = 86_400_000;

/** AP state abbreviations for the venue line ("Naples, Fla."); a state not listed prints as the feed gives it. */
const AP_STATE: Readonly<Record<string, string>> = { FL: 'Fla.' };

/**
 * Whether `instant` (ISO UTC) falls inside the notice's window: from the venue's midnight NOTICE_DAYS_BEFORE days
 * before `startDate` to the end of the venue's day NOTICE_DAYS_AFTER days after `endDate`.
 */
export function festivalNoticeShown(
  instant: string,
  tournament: Pick<FestivalTournament, 'startDate' | 'endDate' | 'utcOffset'>,
): boolean {
  const opens = Date.parse(`${tournament.startDate}T00:00:00${tournament.utcOffset}`) - NOTICE_DAYS_BEFORE * DAY_MS;
  const closes = Date.parse(`${tournament.endDate}T00:00:00${tournament.utcOffset}`) + (NOTICE_DAYS_AFTER + 1) * DAY_MS;
  const at = Date.parse(instant);
  return at >= opens && at < closes;
}

/** "Nov 26–28", or "Nov 30–Dec 2" across a month. */
export function festivalDates(startDate: string, endDate: string): string {
  const [start, end] = [monthDay(startDate), monthDay(endDate)];
  if (start === end) return start;
  return start.split(' ')[0] === end.split(' ')[0] ? `${start}–${end.split(' ')[1]}` : `${start}–${end}`;
}

/** "Naples, Fla. · Nov 26–28" */
export function festivalNoticeMeta(tournament: Pick<FestivalTournament, 'startDate' | 'endDate' | 'venue'>): string {
  const { city, state } = tournament.venue;
  return `${city}, ${AP_STATE[state] ?? state} · ${festivalDates(tournament.startDate, tournament.endDate)}`;
}

export function FestivalNotice({ now = BUILD_INSTANT }: { now?: string }) {
  if (!HAS_FESTIVAL) return null;
  const { tournament } = getFestival();
  if (!festivalNoticeShown(now, tournament)) return null;
  return (
    <section className="sx-section" data-first="" data-festival-notice="">
      <SectionHeader
        kicker="National Hockey Festival"
        meta={festivalNoticeMeta(tournament)}
        action={{ href: '/festival', label: 'Results and brackets' }}
      />
    </section>
  );
}

export default FestivalNotice;
