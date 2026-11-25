/**
 * Games between two levels: one school's varsity against a team that is not a varsity team, one school's JV
 * against a team that is not a JV team, or one school's freshman team against a team that is not a freshman team.
 *
 * MaxPreps does not file such a game under the other school's team at the other level. The coach enters it against
 * one of two placeholder teams, each with an id of its own (read 2026-11-21, every sport the same ids):
 *
 *   "Non Varsity Opponent"  4fc9dcd1-…  in a VARSITY schedule: the opponent was a JV, frosh-soph or club side
 *                                       (soccer: Burlingame Nov 19 at St. Ignatius, Woodside Dec 21)
 *   "Non JV Opponent"       d1bd084e-…  in a JV schedule: the opponent was a varsity, frosh-soph or club side
 *                                       (or a scrimmage a coach entered: Piedmont Hills' Nov 17 row, its Milpitas
 *                                       scrimmage, is left out by lib/jv/jv-corrections.ts)
 *                                       (soccer: six JV games to come; field hockey: University City, La Jolla)
 *   "Non Freshman Opponent" 505c1a99-…  in a FRESHMAN schedule: the opponent was a varsity, JV or club side
 *                                       (soccer, read 2026-11-25: St. Ignatius' 10-0 of Nov 19 and three to come)
 *
 * So the game is a real game (it is played and scored; MaxPreps counts it in the school's record), but the other side
 * is not a school, and it is not the same team from one game to the next. This module is how the site says so:
 *
 *   - its name is words, not a school's ("Non-varsity team", "Non-JV team"), wherever the game is read
 *     (`withCrossLevelNames`, applied as lib/data.ts and lib/jv/jv.ts load the games), so no list, title or card
 *     prints MaxPreps' placeholder as if it were a school;
 *   - the line under its name on a scoreboard says MaxPreps does not name it (CROSS_LEVEL_SUB), and the game page
 *     says what the game is and what it counts for (`crossLevelNote`);
 *   - two such games are never one "season series": the placeholder is a different team each time.
 *
 * What it counts for needs no rule here: it is outside the registry, so it is never a league game (lib/classify.ts)
 * or a JV league game (lib/jv/jv-standings.ts, `outside-registry`), and the ratings count only games between two
 * registry teams (lib/ratings/ratings.ts). It stays in the school's overall record (varsity) or JV record (JV), as on
 * MaxPreps.
 *
 * "Tournament Opponent" (b6e1f3f8-…) is a different placeholder, a tournament slot whose opponent is not set, and is
 * not a game yet: lib/league-config/data-quality.ts drops it as a ghost.
 *
 * Pure: no imports, so a page, a script and a test can all reach it.
 */

export type CrossLevelKind = 'non-varsity' | 'non-jv' | 'non-freshman';

export interface CrossLevelOpponent {
  kind: CrossLevelKind;
  /** The name the site prints for it. */
  name: string;
  /** MaxPreps' name for the placeholder, verbatim. */
  maxprepsName: string;
}

export const NON_VARSITY_OPPONENT_ID = '4fc9dcd1-3d2c-4d0a-998e-4340bac0ac02';
export const NON_JV_OPPONENT_ID = 'd1bd084e-1f5b-4e7c-8f99-6c63e0e9e855';
export const NON_FRESHMAN_OPPONENT_ID = '505c1a99-e49f-4daa-8ec8-355baf311697';

const OPPONENTS: Readonly<Record<string, CrossLevelOpponent>> = {
  [NON_VARSITY_OPPONENT_ID]: { kind: 'non-varsity', name: 'Non-varsity team', maxprepsName: 'Non Varsity Opponent' },
  [NON_JV_OPPONENT_ID]: { kind: 'non-jv', name: 'Non-JV team', maxprepsName: 'Non JV Opponent' },
  [NON_FRESHMAN_OPPONENT_ID]: { kind: 'non-freshman', name: 'Non-freshman team', maxprepsName: 'Non Freshman Opponent' },
};

/** The line under a cross-level placeholder's name on a scoreboard, in place of the non-member note. */
export const CROSS_LEVEL_SUB = 'Not named on MaxPreps';

/** The placeholder a MaxPreps team id is, or undefined for any real team. */
export function crossLevelOpponentOf(teamId: string | null | undefined): CrossLevelOpponent | undefined {
  return teamId ? OPPONENTS[teamId] : undefined;
}

interface Sided {
  home: { teamId: string | null; name: string };
  away: { teamId: string | null; name: string };
}

/** The game's cross-level placeholder side and the other side, or undefined for a game between two real teams. */
export function crossLevelSides<G extends Sided>(
  game: G,
): { opponent: CrossLevelOpponent; which: 'home' | 'away'; school: G['home'] } | undefined {
  const home = crossLevelOpponentOf(game.home.teamId);
  if (home) return { opponent: home, which: 'home', school: game.away };
  const away = crossLevelOpponentOf(game.away.teamId);
  if (away) return { opponent: away, which: 'away', school: game.home };
  return undefined;
}

/** True for a game against a cross-level placeholder. */
export function isCrossLevelGame(game: Sided): boolean {
  return crossLevelSides(game) !== undefined;
}

/** The games with each cross-level placeholder side renamed in words; every other game is returned as it is. */
export function withCrossLevelNames<G extends Sided>(games: readonly G[]): G[] {
  return games.map((g) => {
    const home = crossLevelOpponentOf(g.home.teamId);
    const away = crossLevelOpponentOf(g.away.teamId);
    if (!home && !away) return g;
    return {
      ...g,
      ...(home ? { home: { ...g.home, name: home.name } } : {}),
      ...(away ? { away: { ...g.away, name: away.name } } : {}),
    };
  });
}

/**
 * The game page's sentence for a cross-level game: who played whom, as far as MaxPreps says, and what it counts for.
 * `schoolName` is the real side's name as the page prints it.
 */
export function crossLevelNote(game: Sided, schoolName: string): string | null {
  const sides = crossLevelSides(game);
  if (!sides) return null;
  const lead = `MaxPreps lists the opponent only as “${sides.opponent.maxprepsName}”: `;
  switch (sides.opponent.kind) {
    case 'non-varsity':
      return (
        `${lead}${schoolName}’s varsity played a JV, frosh-soph or club side it does not name. ` +
        `The game counts in ${schoolName}’s overall record, as on MaxPreps, but in no league table and no rating.`
      );
    case 'non-jv':
      return (
        `${lead}${schoolName}’s JV played a varsity, frosh-soph or club side it does not name. ` +
        `The game counts in ${schoolName}’s JV record, as on MaxPreps, but in no JV table.`
      );
    case 'non-freshman':
      return (
        `${lead}${schoolName}’s freshman team played a varsity, JV or club side it does not name. ` +
        `The game counts in ${schoolName}’s freshman record, as on MaxPreps.`
      );
  }
}
