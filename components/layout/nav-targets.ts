/**
 * The nav's per-league targets, shared by TopNav and BottomTabBar. A server-side module: it reads
 * lib/leagues, which tests/ui/client-boundary.test.ts keeps out of client modules, so it cannot
 * live in the client NavLink.tsx beside the nav logic that consumes its output.
 */
import { CCS_LEAGUE_IDS, LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS, UNBRACKETED_LEAGUE_IDS } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

/**
 * The league-aware targets of the three nav entries that have a per-league place (SPEC §8.3),
 * built once from the league config and handed to the client `NavLink` as plain, serializable
 * objects. Scores → `/schedule/<id>`; Teams → the league's section of the teams-and-standings page
 * (`/teams#<id>`, which took over the old Table tab's job of opening your league's tables, DESIGN
 * §18); Playoffs → the league's section of the CCS page (`/playoffs#<id>`) for a CCS-ladder league,
 * its own tournament page (`/playoffs/<id>`) for a league-tournament league, and its pointer card on
 * the CCS page (`/playoffs#<id>`) for an unbracketed league (the EAL: no bracket, no page of its
 * own). Every other entry keeps its one href.
 */
export function navLeagueHrefs(): Readonly<Record<string, Readonly<Record<LeagueId, string>>>> {
  const per = (f: (id: LeagueId) => string | null) =>
    Object.fromEntries(
      LEAGUE_IDS.flatMap((id) => {
        const href = f(id);
        return href === null ? [] : [[id, href] as const];
      }),
    );
  return {
    '/schedule': per((id) => `/schedule/${id}`),
    '/teams': per((id) => `/teams#${id}`),
    '/playoffs': per((id) =>
      TOURNAMENT_LEAGUE_IDS.includes(id)
        ? `/playoffs/${id}`
        : CCS_LEAGUE_IDS.includes(id) || UNBRACKETED_LEAGUE_IDS.includes(id)
          ? `/playoffs#${id}`
          : null,
    ),
  };
}
