import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import ScoreDay from '../../../components/schedule/ScoreDay';
import { dayDescription } from '../../../components/schedule/day-summary';
import { OG_BASE } from '../../../components/layout/site';
import { getGameDates, getGames } from '../../../lib/data';
import { longDate, parseLocal, shortDate } from '../../../lib/format';
import { capitalized } from '../../../components/words/capitalized';
import { SPORT } from '../../../lib/sports/current';

/**
 * `/scores/[date]` — one day's scores (DESIGN §33): the Scores page (components/schedule/ScoreDay.tsx)
 * for that date. `/` and `/schedule` are the same view for today's Pacific date.
 *
 * One prerendered page per date that actually has a contest (one per game date in the snapshot).
 * Unknown dates `notFound()` rather than rendering an empty day, because an empty day and a day with
 * no games are different claims and only one of them is true. The date bar steps through dates that
 * HAVE contests, not calendar neighbours, and its Calendar links only those.
 *
 * Grouped by region, then by competition (SPEC §10.4; DESIGN §24.3):
 *  - `<section id="norcal" data-region-scope="norcal">`, h2 "Northern California": one strip per NorCal
 *    league (its league games and its postseason games), per postseason event no league owns, then
 *    Non-league; then that region's moved-game note and its leagues' unreported official fixtures;
 *  - only on a day that has one, `<section id="between-regions">`, shown in both regions' views, strip
 *    "NorCal vs SoCal": the games with a registry side in each region, never repeated in a region block;
 *  - `<section id="socal" data-region-scope="socal">`, the same for SoCal, its repeated ids suffixed
 *    `-socal` (`#non-league-socal`; DESIGN-socal §2.4).
 * A game appears once in what a reader sees (day-summary.ts dayRegions; the league tabs' copies are
 * hidden by the scope stylesheet). A region with no game that day still renders its block, with one
 * sentence. The day's JV games come last, one block per region (`#jv`, `#jv-socal`).
 *
 * The meta description counts each region (a NorCal vs SoCal game in both) only when both regions
 * have a game; a one-region day keeps the whole-day form it always had.
 */

/** Every date with a contest is prerendered; anything else is a 404 rather than a runtime render. */
export const dynamicParams = false;

export function generateStaticParams(): { date: string }[] {
  return getGameDates().map((date) => ({ date }));
}

export async function generateMetadata({
  params,
}: PageProps<'/scores/[date]'>): Promise<Metadata> {
  const { date } = await params;
  if (!getGameDates().includes(date)) return { title: 'Day not found' };
  const games = getGames({ date });
  const year = parseLocal(date).year;
  const description = dayDescription(games, `${longDate(date)}, ${year}`);
  // The sport first: "Scores for Thu Sep 24" alone could be any sport's scores page.
  const title = `${capitalized(SPORT.noun)} scores — ${shortDate(date)}, ${year}`;
  return {
    title,
    description,
    alternates: { canonical: `/scores/${date}` },
    openGraph: { ...OG_BASE, title, description, url: `/scores/${date}` },
  };
}

export default async function ScoresByDatePage({ params }: PageProps<'/scores/[date]'>) {
  const { date } = await params;
  if (!getGameDates().includes(date)) notFound();
  return <ScoreDay date={date} />;
}
