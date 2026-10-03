/**
 * `recordAsOf` (components/game/game-model.ts) — the scoreboard sub-line is the league record AT
 * the game, not today's (G-1).
 *
 * Built from the all-2026-10-02 CORPUS snapshot (SPEC §13.6), like the other game-model tests, so
 * the run is deterministic and a frozen league on the live snapshot cannot make standings and games
 * disagree. The one point where "as of this game" and "today" must agree is a team's most recent
 * league final, so that is the anchor. Earlier finals must then never show more games than the
 * current standing has.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { corpusSnapshotPath } from '../helpers';

type Data = typeof import('../../lib/data');
type Model = typeof import('../../components/game/game-model');
type Leagues = typeof import('../../lib/leagues');
type Format = typeof import('../../lib/format');
type GameIds = typeof import('../../lib/game-id');

const priorEnv = process.env.SCVAL_SNAPSHOT;
let d: Data;
let m: Model;
let leagues: Leagues;
let fmt: Format;
let ids: GameIds;

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  vi.resetModules();
  d = await import('../../lib/data');
  m = await import('../../components/game/game-model');
  leagues = await import('../../lib/leagues');
  fmt = await import('../../lib/format');
  ids = await import('../../lib/game-id');
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

describe('recordAsOf', () => {
  it("equals the current standing on each team's latest league final", () => {
    let checked = 0;
    for (const team of d.getTeams()) {
      const form = d.getTeamForm(team.slug);
      const standing = d.getStandingFor(team.slug);
      const latest = form?.leagueGames.filter((g) => g.outcome !== null).at(-1);
      if (!latest || !standing) continue;
      const model = m.buildGameModel(ids.gameIdToParam(latest.contestId));
      expect(model, latest.contestId).toBeDefined();
      if (!model) continue;
      const side = model.home.team?.slug === team.slug ? model.home : model.away;
      expect(side.team?.slug, team.slug).toBe(team.slug);
      const scope =
        leagues.divisionHeading(team.division) ?? leagues.leagueOfDivision(team.division).shortName;
      expect(side.sub, team.slug).toBe(`${fmt.recordString(standing.computed)} ${scope}`);
      checked += 1;
    }
    // The corpus has league results for most of the 43 teams; a vacuous pass is a failure.
    expect(checked).toBeGreaterThan(d.getTeams().length / 2);
  });

  it('counts this game on a final and leaves it out of a game still to play', () => {
    let checked = 0;
    for (const game of d.getGames({ leagueOnly: true })) {
      for (const side of [game.home, game.away]) {
        if (!side.slug) continue;
        const form = d.getTeamForm(side.slug);
        const entry = form?.leagueGames.find((g) => g.contestId === game.contestId);
        const record = m.recordAsOf(game, side);
        if (!form || !entry || !record) continue;
        const index = form.leagueGames.indexOf(entry);
        const before = form.leagueGames.slice(0, index).filter((g) => g.outcome !== null).length;
        expect(record.gp, game.contestId).toBe(before + (entry.outcome !== null ? 1 : 0));
        expect(record.w + record.l + record.t).toBe(record.gp);
        const current = d.getStandingFor(side.slug)?.computed.gp ?? 0;
        expect(record.gp).toBeLessThanOrEqual(current);
        checked += 1;
      }
    }
    expect(checked, 'a vacuous pass is a failure').toBeGreaterThan(d.getTeams().length);
  });

  it('never prints 0-0-0 — a side with no league result yet gets the honest line', () => {
    for (const game of d.getGames()) {
      const model = m.buildGameModel(ids.gameIdToParam(game.contestId));
      for (const side of model ? [model.away, model.home] : []) {
        if (side.sub === null) continue;
        expect(side.sub.startsWith('0-0-0'), game.contestId).toBe(false);
      }
    }
  });

  it("keeps 'not reported' for teams with no results — before a team's first league game it says 'yet'", () => {
    let yet = 0;
    for (const game of d.getGames()) {
      const model = m.buildGameModel(ids.gameIdToParam(game.contestId));
      for (const side of model ? [model.away, model.home] : []) {
        if (side.sub === null) continue;
        if (side.standing?.hasReportedResults) {
          // DESIGN §8's missing-data line on a team that later posted a record read as a site gap.
          expect(side.sub.startsWith('No league results reported'), game.contestId).toBe(false);
        }
        if (side.sub.startsWith('No league results yet')) yet += 1;
      }
    }
    // Early-season non-league finals exist in the corpus; a vacuous pass is a failure.
    expect(yet).toBeGreaterThan(0);
  });
});
