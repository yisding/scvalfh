/**
 * The uneven-games sentence of the standings engine (lib/engine/standings.ts): the league lookup only;
 * the words are lib/format/standings.ts unevenGamesWords.
 */

import { getLeague } from '@/lib/config/leagues';
import { unevenGamesWords } from '@/lib/format/standings';
import type { LeagueId } from '@/lib/model/ids';

/**
 * The games-played sentence of the uneven-GP footnote (SPEC §10.3), or null when every team with results
 * has played within one game of the others. With a fixed schedule (`scheduled` = DivisionConfig.gamesPerTeam)
 * it is the sentence the standings page has always printed: 'Teams have played between 9 and 12 of 16
 * league games, so points favour teams that have played more.' A league with no fixed schedule
 * (gamesPerTeam null: the Sunset, whose ten teams meet 0, 1 or 2 times and play only the games MaxPreps
 * marks as league games) has no "of N" to say, and no LEFT or MAX column to explain; its sentence says
 * what the gap is instead (DESIGN-socal §2.1.7). The rest of the footnote — LEFT, MAX and how the table
 * is ordered — is views/standings/footnotes.ts unevenGpFootnote's, which reads this.
 */
export function unevenGamesSentence(
  leagueId: LeagueId,
  spread: { min: number; max: number; scheduled: number | null },
): string | null {
  if (spread.max - spread.min < 2) return null;
  if (spread.scheduled !== null) return unevenGamesWords(spread, null);
  const league = getLeague(leagueId);
  return unevenGamesWords(spread, { shortName: league.shortName, classification: league.rules.classification });
}
