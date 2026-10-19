/**
 * Official-fixture carry-forward (SPEC §5.3): what the official step puts back, per division, when
 * a division's official schedule could not be read or loaded this run.
 */

import type { OfficialFixture } from '@/lib/model/fixture';
import type { Game } from '@/lib/model/game';
import type { DivisionId } from '@/lib/model/ids';

export interface CarryOfficialResult {
  /** The previous snapshot's unmatched fixtures for the divisions that were not read. */
  fixtures: OfficialFixture[];
  /** `games`, with `official` put back on the games those divisions own. */
  games: Game[];
  /** How many games got their marker back. */
  carried: number;
}

/**
 * SPEC §5.3, PER DIVISION: what to put back when one grid could not be read this run.
 *
 * The two grids are two requests and either can fail alone, so "did this run produce any official
 * fixtures at all" is the wrong question — El Camino matching all 56 of its fixtures legitimately
 * contributes an EMPTY unmatched array, which is indistinguishable from De Anza's request failing
 * if you only look at the section. Keyed on the division instead, nothing a successful grid said
 * this run is ever overwritten, and nothing a failed grid used to say is silently dropped.
 *
 * A game is attributed to a grid by `leagueDivision`, which is set only when both schools are
 * registry members of the same division — exactly what a division grid lists (verified: 56 rows
 * each, zero cross-division). Carry-forward only ever FILLS A HOLE: a marker this run produced
 * always wins.
 */
export function carryOfficialForward(
  missing: readonly DivisionId[],
  previous: { officialFixtures?: readonly OfficialFixture[]; games: readonly Game[] },
  games: readonly Game[],
): CarryOfficialResult {
  const wanted = new Set(missing);
  if (wanted.size === 0) return { fixtures: [], games: [...games], carried: 0 };

  const fixtures = (previous.officialFixtures ?? [])
    .filter((f) => wanted.has(f.division))
    .slice()
    .sort((a, b) =>
      a.dateKey === b.dateKey
        ? `${a.awayName}@${a.homeName}`.localeCompare(`${b.awayName}@${b.homeName}`)
        : a.dateKey.localeCompare(b.dateKey),
    );

  const prevById = new Map(previous.games.map((g) => [g.contestId, g]));
  let carried = 0;
  const out = games.map((game) => {
    if (game.official || game.leagueDivision === null || !wanted.has(game.leagueDivision)) {
      return game;
    }
    const official = prevById.get(game.contestId)?.official;
    if (!official) return game;
    carried += 1;
    return { ...game, official };
  });

  return { fixtures, games: out, carried };
}
