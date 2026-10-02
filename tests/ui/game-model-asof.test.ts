/**
 * `recordAsOf` (components/game/game-model.ts) — the scoreboard sub-line is the league record AT
 * the game, not today's (G-1).
 *
 * Built from the committed snapshot: the one point where "as of this game" and "today" must agree
 * is a team's most recent league final, so that is the anchor. Earlier finals must then never
 * show more games than the current standing has.
 */

import { describe, expect, it } from 'vitest';

import { buildGameModel, recordAsOf } from '../../components/game/game-model';
import { getGames, getStandingFor, getTeamForm } from '../../lib/data';
import { recordString } from '../../lib/format';
import { DIVISION_LABELS } from '../../lib/season';
import { TEAMS } from '../../lib/teams';

describe('recordAsOf', () => {
  it("equals the current standing on each team's latest league final", () => {
    let checked = 0;
    for (const team of TEAMS) {
      const form = getTeamForm(team.slug);
      const standing = getStandingFor(team.slug);
      const latest = form?.leagueGames.filter((g) => g.outcome !== null).at(-1);
      if (!latest || !standing) continue;
      const model = buildGameModel(latest.contestId);
      expect(model, latest.contestId).toBeDefined();
      if (!model) continue;
      const side = model.home.team?.slug === team.slug ? model.home : model.away;
      expect(side.team?.slug, team.slug).toBe(team.slug);
      expect(side.sub, team.slug).toBe(
        `${recordString(standing.computed)} ${DIVISION_LABELS[team.division]}`,
      );
      checked += 1;
    }
    // The snapshot has league results for most of the 15 schools; a vacuous pass is a failure.
    expect(checked).toBeGreaterThan(5);
  });

  it('counts this game on a final and leaves it out of a game still to play', () => {
    for (const game of getGames().filter((g) => g.isLeague)) {
      for (const side of [game.home, game.away]) {
        if (!side.slug) continue;
        const form = getTeamForm(side.slug);
        const entry = form?.leagueGames.find((g) => g.contestId === game.contestId);
        const record = recordAsOf(game, side);
        if (!form || !entry || !record) continue;
        const index = form.leagueGames.indexOf(entry);
        const before = form.leagueGames.slice(0, index).filter((g) => g.outcome !== null).length;
        expect(record.gp, game.contestId).toBe(before + (entry.outcome !== null ? 1 : 0));
        expect(record.w + record.l + record.t).toBe(record.gp);
        const current = getStandingFor(side.slug)?.computed.gp ?? 0;
        expect(record.gp).toBeLessThanOrEqual(current);
      }
    }
  });

  it('never prints 0-0-0 — a side with no league result yet gets the honest line', () => {
    for (const game of getGames()) {
      const model = buildGameModel(game.contestId);
      for (const side of model ? [model.away, model.home] : []) {
        if (side.sub === null) continue;
        expect(side.sub.startsWith('0-0-0'), game.contestId).toBe(false);
      }
    }
  });
});
