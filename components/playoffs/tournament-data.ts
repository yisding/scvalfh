/**
 * The league-tournament lookup that `/playoffs/<league>` and its OG card share (SPEC §6.2, §8.1):
 * which params the route prerenders, and the league plus its tournament config for one of them.
 *
 * It reads `lib/data`, so it sits beside the pure `playoff-view.ts` rather than in it, the way
 * `components/standings/standings-data.ts` sits beside `standings-view.ts`. The page and the OG
 * route both call these, so the OG card's params and its 404 guard cannot drift from the page's.
 * They are not exported from the page itself because a page file may only export the route's own
 * names.
 */

import { getLeagueSummary, getTournamentLeagueIds, type LeagueSummary } from '../../lib/data';
import { getLeague, type LeagueConfig } from '../../lib/leagues';

/** A league-tournament league's postseason config (MCAL's). */
export type TournamentConfig = Extract<LeagueConfig['postseason'], { kind: 'league-tournament' }>;

/** One param per league-tournament league (today `mcal`): the page's and the OG card's `generateStaticParams`. */
export function tournamentStaticParams(): { league: string }[] {
  return getTournamentLeagueIds().map((league) => ({ league }));
}

/**
 * The league and its tournament config, or undefined for any param that is not a tournament league
 * (an unknown id, a CCS league, the unbracketed EAL). Checked BEFORE `getLeagueTournament`, which
 * throws for a league without a tournament.
 */
export function tournamentLeague(
  id: string,
): { summary: LeagueSummary; config: LeagueConfig; ps: TournamentConfig } | undefined {
  if (!getTournamentLeagueIds().includes(id)) return undefined;
  const summary = getLeagueSummary(id);
  if (!summary) return undefined;
  const config = getLeague(summary.id);
  if (config.postseason.kind !== 'league-tournament') return undefined;
  return { summary, config, ps: config.postseason };
}
