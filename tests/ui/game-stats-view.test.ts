/**
 * The game page's Game stats section: components/game/game-stats-view.ts and
 * components/game/GameStats.tsx, over synthetic box scores on a real final (whatever the committed
 * snapshot holds), and over every box score in the committed data/player-stats.json for the rules
 * every refresh must keep.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import GameStats from '../../components/game/GameStats';
import { buildGameStatsView, type BoxScoreLookup } from '../../components/game/game-stats-view';
import { buildGameView, type GameModel } from '../../components/game/game-view';
import { getSnapshot } from '../../lib/data';
import { gameIdToParam } from '../../lib/game-id';
import { getPlayerStats } from '../../lib/player-stats';
import type { BoxScore } from '../../lib/player-stats-schema';
import type { Game } from '../../lib/types';
import { textOf } from './html-text';

/** A final between two followed teams, both sides scoring, on MaxPreps: the synthetic box scores' game. */
const GAME: Game = getSnapshot().games.find(
  (g) =>
    g.status === 'final' &&
    !g.forfeitBy &&
    !g.contestId.startsWith('sblive:') &&
    g.home.slug &&
    g.away.slug &&
    (g.home.score ?? 0) >= 2 &&
    (g.away.score ?? 0) >= 1,
)!;
const model = (): GameModel => buildGameView(gameIdToParam(GAME.contestId))!;
const AWAY = GAME.away.slug!;
const HOME = GAME.home.slug!;

function box(players: BoxScore['players'], tracked: Partial<BoxScore['tracked']> = {}): BoxScore {
  return {
    contestId: GAME.contestId,
    rowKey: 'test',
    tracked: { field: tracked.field ?? ['goals', 'assists', 'points'], goalkeeping: tracked.goalkeeping ?? [] },
    totals: { field: {}, goalkeeping: {} },
    players,
    warnings: [],
  };
}
const only = (slug: string, b: BoxScore): BoxScoreLookup => (id, s) => (id === GAME.contestId && s === slug ? b : undefined);

describe('buildGameStatsView', () => {
  it('lists the scorers, most goals first, and leaves out a player with nothing to show', () => {
    const goals = GAME.home.score!;
    const b = box([
      { name: 'Assist Only', jersey: '4', field: { assists: 1, points: 1 }, goalkeeping: null },
      { name: 'Top Scorer', jersey: '9', field: { goals: goals - 1, points: 2 * (goals - 1) }, goalkeeping: null },
      { name: 'One Goal', jersey: '12', field: { goals: 1, assists: 1, points: 3 }, goalkeeping: null },
      { name: 'Points Only', jersey: '7', field: { points: 0 }, goalkeeping: null },
    ]);
    const view = buildGameStatsView(model(), only(HOME, b))!;
    const home = view.sides.find((s) => s.key === HOME)!;
    expect(home.scoring!.columns.map((c) => c.label)).toEqual(['G', 'A']);
    const expected =
      goals - 1 > 1
        ? [['Top Scorer', [goals - 1, null]], ['One Goal', [1, 1]], ['Assist Only', [null, 1]]]
        : [['One Goal', [1, 1]], ['Top Scorer', [goals - 1, null]], ['Assist Only', [null, 1]]];
    expect(home.scoring!.rows.map((r) => [r.name, r.values])).toEqual(expected);
    expect(home.notes).toEqual([]);
    expect(view.legend).toEqual(['G goals', 'A assists']);
  });

  it('lists away first, and says when a followed side entered nothing', () => {
    const view = buildGameStatsView(model(), only(HOME, box([{ name: 'X', jersey: null, field: { goals: 1 }, goalkeeping: null }])))!;
    expect(view.sides.map((s) => s.key)).toEqual([AWAY, HOME]);
    expect(view.sides[0]).toMatchObject({ entered: false, scoring: null, goalies: null });
  });

  it('shows a goalkeeper with a 0 in a tracked column, and only the columns tracked', () => {
    const b = box(
      [
        { name: 'Keeper', jersey: '1', field: null, goalkeeping: { saves: 0, goalsAgainst: GAME.away.score! } },
        { name: 'Wins Only', jersey: '2', field: null, goalkeeping: { wins: 1 } },
      ],
      { field: [], goalkeeping: ['saves', 'goalsAgainst', 'wins'] },
    );
    const view = buildGameStatsView(model(), only(HOME, b))!;
    const home = view.sides.find((s) => s.key === HOME)!;
    expect(home.scoring).toBeNull();
    expect(home.goalies!.columns.map((c) => c.label)).toEqual(['Sv', 'GA']);
    expect(home.goalies!.rows.map((r) => [r.name, r.values])).toEqual([['Keeper', [0, GAME.away.score]]]);
    // No goal is credited to a player, so the side's score is not accounted for.
    expect(home.notes).toEqual([`${model().home.name}'s entries name no scorer for its ${GAME.home.score} goals.`]);
  });

  it('says where the goals credited and the score disagree', () => {
    const credit = (n: number) =>
      buildGameStatsView(model(), only(HOME, box([{ name: 'X', jersey: null, field: { goals: n }, goalkeeping: null }])))!
        .sides.find((s) => s.key === HOME)!.notes;
    const name = model().home.name;
    const score = GAME.home.score!;
    expect(credit(score)).toEqual([]);
    expect(credit(score - 1)).toEqual([`${name}'s entries credit ${score - 1} of its ${score} goals to a player.`]);
    expect(credit(score + 1)).toEqual([`${name}'s entries credit ${score + 1} goals, more than the ${score} on the scoreboard.`]);
    // A forfeit's score is not a game's goals.
    const forfeit = { ...model(), game: { ...GAME, forfeitBy: 'away' as const } };
    const view = buildGameStatsView(forfeit, only(HOME, box([{ name: 'X', jersey: null, field: { goals: 1 }, goalkeeping: null }])))!;
    expect(view.sides.find((s) => s.key === HOME)!.notes).toEqual([]);
  });

  it('shows nothing for a game with no entries, or one that is not a final', () => {
    expect(buildGameStatsView(model(), () => undefined)).toBeNull();
    const b = box([{ name: 'X', jersey: null, field: { goals: 1 }, goalkeeping: null }]);
    const upcoming = { ...model(), game: { ...GAME, status: 'scheduled' as const } };
    expect(buildGameStatsView(upcoming, only(HOME, b))).toBeNull();
  });
});

describe('GameStats', () => {
  it('renders each side under its name, a caption per table, and the legend', () => {
    const b = box(
      [
        { name: 'Top Scorer', jersey: '9', field: { goals: GAME.home.score! }, goalkeeping: null },
        { name: 'Keeper', jersey: '1', field: null, goalkeeping: { saves: 4 } },
      ],
      { field: ['goals'], goalkeeping: ['saves'] },
    );
    const html = renderToStaticMarkup(createElement(GameStats, { model: model(), lookup: only(HOME, b) }));
    const text = textOf(html);
    const m = model();
    expect(html).toContain('id="game-stats-kicker"');
    expect(text).toContain('Game stats');
    expect(html).toContain(`<caption class="sr-only">${m.home.name} scoring in this game</caption>`);
    expect(html).toContain(`<caption class="sr-only">${m.home.name} goalkeeping in this game</caption>`);
    expect(text).toContain('Goalkeeper');
    expect(text).toContain('No stats entered on MaxPreps for this game.');
    expect(text).toContain('G goals · Sv saves.');
    expect(renderToStaticMarkup(createElement(GameStats, { model: m, lookup: () => undefined }))).toBe('');
  });
});

describe('every box score in data/player-stats.json', () => {
  it('gives its game a Game stats section with no row of zeros', () => {
    const games = new Map(getSnapshot().games.map((g) => [g.contestId, g]));
    for (const t of getPlayerStats().teams) {
      for (const b of t.games ?? []) {
        const game = games.get(b.contestId);
        if (!game || game.status !== 'final') continue;
        const view = buildGameStatsView(buildGameView(gameIdToParam(game.contestId))!);
        expect(view, b.contestId).not.toBeNull();
        const side = view!.sides.find((s) => s.key === t.slug)!;
        expect(side.entered).toBe(true);
        for (const row of side.scoring?.rows ?? []) expect(row.values.some((v) => (v ?? 0) > 0), row.name).toBe(true);
      }
    }
  });
});
