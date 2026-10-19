/**
 * The league-tournament lookup that `/playoffs/<league>` and its OG card share (SPEC §6.2, §8.1;
 * contract: views/site/route-contract.ts): which params the route prerenders, and the league plus
 * its tournament config for one of them.
 *
 * It reads `lib/queries/`, so it sits beside the pure `tournament.ts` rather than in it, the way
 * `views/standings/standings-view.ts` sits beside `division.ts`. The page and the
 * OG route both call these, so the OG card's params and its 404 guard cannot drift from the page's.
 * They are not exported from the page itself because a page file may only export the route's own
 * names. The page's own words and model are views/playoffs/tournament-page.ts.
 */

import { TOURNAMENT_LEAGUE_IDS, getLeague } from '@/lib/config/leagues';
import type { LeagueConfig } from '@/lib/model/league-config';
import { type LeagueSummary, getLeagueSummary } from '@/lib/queries/leagues';
import type { StaticParams } from '@/views/site/route-contract';

/** A league-tournament league's postseason config (MCAL's). */
export type TournamentConfig = Extract<LeagueConfig['postseason'], { kind: 'league-tournament' }>;

/** One param per league-tournament league (today `mcal`): the page's and the OG card's `generateStaticParams`. */
export function tournamentStaticParams(): StaticParams<'league'> {
  return TOURNAMENT_LEAGUE_IDS.map((league) => ({ league }));
}

/**
 * The league and its tournament config, or null for any param that is not a tournament league
 * (an unknown id, a CCS league, the unbracketed EAL). Checked BEFORE `getLeagueTournament`, which
 * throws for a league without a tournament.
 */
export function tournamentParam(
  raw: string,
): { summary: LeagueSummary; config: LeagueConfig; ps: TournamentConfig } | null {
  if (!TOURNAMENT_LEAGUE_IDS.includes(raw)) return null;
  const summary = getLeagueSummary(raw);
  if (!summary) return null;
  const config = getLeague(summary.id);
  if (config.postseason.kind !== 'league-tournament') return null;
  return { summary, config, ps: config.postseason };
}
