/**
 * What the per-date OG card (components/og/ScoresDayCard.tsx; route:
 * app/scores/[date]/opengraph-image.tsx) prints for one date with a contest: the title
 * `<Thu Sep 24> · <n> games in <k> leagues` (SPEC §8.4), at most four game lines led by the day's
 * headline result (the final with the largest margin), how many games did not fit, and the counts
 * for the footer.
 *
 * Every line comes from `dayLines()` → `describeGame()` (views/scores/day-summary.ts), so a game
 * with no published score shows an en dash on the card exactly as it does in the HTML.
 */

import { shortDate } from '@/lib/format/dates';
import { getGames } from '@/lib/queries/games';
import { type DayLine, dayCardTitle, dayLines, headlineGame, orderedForPreview } from './day-summary';

/** The most game lines the card has room for. */
const MAX_LINES = 4;

export interface DayCardModel {
  /** `Thu Sep 24 · 23 games in 4 leagues` */
  heading: string;
  /** The headline result first, then finals before everything else; at most MAX_LINES. */
  lines: DayLine[];
  /** The day's games that are not among `lines`. */
  remaining: number;
  /** Every game on the date. */
  total: number;
  /** How many of them are final. */
  finals: number;
}

/** The card for `date`, a date the route has already checked with `scoresParam`. */
export function dayCardModel(date: string): DayCardModel {
  const games = getGames({ date });
  const headline = headlineGame(games);
  const ordered = headline
    ? [headline, ...orderedForPreview(games).filter((g) => g.contestId !== headline.contestId)]
    : orderedForPreview(games);
  const lines = dayLines(ordered.slice(0, MAX_LINES));
  return {
    heading: dayCardTitle(shortDate(date), games),
    lines,
    remaining: games.length - lines.length,
    total: games.length,
    finals: games.filter((game) => game.status === 'final').length,
  };
}
