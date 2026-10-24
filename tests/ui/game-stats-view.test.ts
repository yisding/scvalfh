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
import { TIEBREAK_CAVEAT, buildGameStatsView, type GameStatsLookup } from '../../components/game/game-stats-view';
import { buildGameView, type GameModel } from '../../components/game/game-view';
import { getSnapshot } from '../../lib/data';
import { gameIdToParam } from '../../lib/game-id';
import type { NoteCredit } from '../../lib/note-stats';
import { getAllPlayerStatsWithNotes, getGameStatsEntry, getPlayerStats } from '../../lib/player-stats';
import type { BoxScore } from '../../lib/player-stats-schema';
import { SHOOTOUT_NOTE } from '../../lib/postseason';
import type { Game, TeamSlug } from '../../lib/types';
import { textOf } from './html-text';

/** A final between two followed teams, both sides scoring, on MaxPreps: the synthetic box scores' game. */
function pickGame(): Game {
  const game = getSnapshot().games.find(
    (g) =>
      g.status === 'final' &&
      !g.forfeitBy &&
      g.decider === 'REG' &&
      !g.contestId.startsWith('sblive:') &&
      g.home.slug &&
      g.away.slug &&
      (g.home.score ?? 0) >= 2 &&
      (g.away.score ?? 0) >= 1,
  );
  if (!game) throw new Error('tests/ui/game-stats-view: the snapshot has no final between two followed teams with goals on both sides');
  return game;
}
const GAME = pickGame();
const model = (): GameModel => buildGameView(gameIdToParam(GAME.contestId))!;
const AWAY = GAME.away.slug!;
const HOME = GAME.home.slug!;

function box(players: BoxScore['players'], tracked: Partial<BoxScore['tracked']> = {}): BoxScore {
  return {
    contestId: GAME.contestId,
    rowKey: 'test',
    tracked: { field: tracked.field ?? ['goals', 'assists', 'points'], goalkeeping: tracked.goalkeeping ?? [] },
    players,
    warnings: [],
  };
}
/** `slug` has `b`; the other side entered nothing. */
const only =
  (slug: string, b: BoxScore): GameStatsLookup =>
  (id, s) => ({ box: id === GAME.contestId && s === slug ? b : undefined, unread: false, credits: [] });
const nothing: GameStatsLookup = () => ({ box: undefined, unread: false, credits: [] });
const scorer = (goals: number) => box([{ name: 'X', jersey: null, field: { goals }, goalkeeping: null }]);
const lineup = () => box([{ name: 'X', jersey: '3', field: {}, goalkeeping: null }], { field: [], goalkeeping: [] });
const NOTE = 'goals scored Gabby Molly, Emry Borges';
/** A credit from GAME's note for a HOME player. */
function credit(fullName: string, jersey: string | null, stats: Partial<Pick<NoteCredit, 'goals' | 'assists' | 'saves'>>): NoteCredit {
  return {
    contestId: GAME.contestId,
    dateKey: GAME.dateKey,
    opponent: GAME.away.name,
    site: 'home',
    note: NOTE,
    written: fullName,
    via: 'roster',
    athleteId: null,
    careerId: null,
    careerUrl: null,
    fullName,
    jersey,
    goals: 0,
    assists: 0,
    saves: 0,
    ...stats,
  };
}
/** GAME with NOTE as its note. */
const notedModel = (): GameModel => {
  const m = model();
  return { ...m, game: { ...m.game, venue: { ...m.game.venue, text: NOTE } } };
};
const withNote =
  (b: BoxScore | undefined, credits: NoteCredit[]): GameStatsLookup =>
  (_id, s) => (s === HOME ? { box: b, unread: false, credits } : { box: undefined, unread: false, credits: [] });
const homeSide = (m: GameModel, lookup: GameStatsLookup) => buildGameStatsView(m, lookup)!.sides.find((s) => s.key === HOME)!;

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
    expect(view.caveat).toBeNull();
    expect(view.legend).toEqual(['G goals', 'A assists']);
  });

  it('lists away first, and says when a followed side entered nothing', () => {
    const view = buildGameStatsView(model(), only(HOME, scorer(1)))!;
    expect(view.sides.map((s) => s.key)).toEqual([AWAY, HOME]);
    expect(view.sides[0]).toMatchObject({ scoring: null, goalies: null, empty: 'No stats entered on MaxPreps for this game.' });
  });

  it('never says a side entered nothing when its stats could not be read', () => {
    const lookup: GameStatsLookup = (_id, s) =>
      s === HOME ? { box: scorer(GAME.home.score!), unread: false, credits: [] } : { box: undefined, unread: true, credits: [] };
    const away = buildGameStatsView(model(), lookup)!.sides.find((s) => s.key === AWAY)!;
    expect(away.empty).toBe('Stats for this game could not be read in the latest update.');
  });

  it('lists the goalkeeping table longest in goal first, a 0 included, and only the columns tracked', () => {
    const b = box(
      [
        { name: 'Field Player', jersey: '5', field: null, goalkeeping: { saves: 1 } },
        { name: 'Keeper', jersey: '1', field: null, goalkeeping: { saves: 0, goalsAgainst: GAME.away.score!, minutes: 60 } },
        { name: 'Wins Only', jersey: '2', field: null, goalkeeping: { wins: 1 } },
      ],
      { field: [], goalkeeping: ['saves', 'goalsAgainst', 'minutes', 'wins'] },
    );
    const home = homeSide(model(), only(HOME, b));
    expect(home.scoring).toBeNull();
    expect(home.goalies!.columns.map((c) => c.label)).toEqual(['Sv', 'GA', 'Min']);
    expect(home.goalies!.rows.map((r) => [r.name, r.values])).toEqual([
      ['Keeper', [0, GAME.away.score, 60]],
      ['Field Player', [1, null, null]],
    ]);
    // No goal is credited to a player, so the side's score is not accounted for.
    expect(home.notes).toEqual([`No scorer is entered for the ${GAME.home.score} goals.`]);
  });

  it('says where the goals credited and the score disagree', () => {
    const notes = (n: number) => homeSide(model(), only(HOME, scorer(n))).notes;
    const score = GAME.home.score!;
    expect(notes(score)).toEqual([]);
    expect(notes(score - 1)).toEqual([`Scorers are entered for ${score - 1} of the ${score} goals.`]);
    expect(notes(score + 1)).toEqual([`The entries credit ${score + 1} goals, more than the ${score} on the scoreboard.`]);
    // A forfeit's score is not a game's goals.
    const forfeit = { ...model(), game: { ...GAME, forfeitBy: 'away' as const } };
    expect(homeSide(forfeit, only(HOME, scorer(1))).notes).toEqual([]);
  });

  it('on a game whose score may leave out or include a tiebreak, says so once instead of per side', () => {
    const shootout = { ...model(), game: { ...GAME, decider: 'SO' as const } };
    const view = buildGameStatsView(shootout, only(HOME, scorer(GAME.home.score! + 1)))!;
    expect(view.caveat).toBe(TIEBREAK_CAVEAT);
    expect(view.sides.find((s) => s.key === HOME)!.notes).toEqual([]);
    const mcal = { ...model(), postseasonNotes: [SHOOTOUT_NOTE] };
    expect(buildGameStatsView(mcal, only(HOME, scorer(1)))!.caveat).toBe(TIEBREAK_CAVEAT);
    // The caveat never says a shootout was played.
    expect(TIEBREAK_CAVEAT).not.toMatch(/shootout|1 v 1/i);
  });

  it('shows nothing for a game with no table to show, or one that is not a final', () => {
    expect(buildGameStatsView(model(), nothing)).toBeNull();
    // A box score that lists a lineup and tracks nothing has no table.
    expect(buildGameStatsView(model(), only(HOME, lineup()))).toBeNull();
    const upcoming = { ...model(), game: { ...GAME, status: 'scheduled' as const } };
    expect(buildGameStatsView(upcoming, only(HOME, scorer(1)))).toBeNull();
  });

  it('says a side with a box score but no table entered no goals, assists or saves, with no note on its score', () => {
    const lookup: GameStatsLookup = (_id, s) => ({
      box: s === HOME ? lineup() : scorer(GAME.away.score!),
      unread: false,
      credits: [],
    });
    expect(homeSide(model(), lookup)).toMatchObject({
      scoring: null,
      goalies: null,
      empty: 'No goals, assists or saves entered for this game.',
      notes: [],
    });
  });
});

describe('game notes on the game page', () => {
  it("adds a note's goals to the box score line of the same player, and marks the row", () => {
    const b = box([
      { name: 'Gabrielle Moll', jersey: '9', field: { assists: 1 }, goalkeeping: null },
      { name: 'Sarah Anton', jersey: '4', field: { assists: 1 }, goalkeeping: null },
    ], { field: ['assists'] });
    const view = buildGameStatsView(notedModel(), withNote(b, [credit('Gabrielle Moll', '9', { goals: 1 })]))!;
    const home = view.sides.find((s) => s.key === HOME)!;
    expect(home.scoring!.columns.map((c) => c.label)).toEqual(['G', 'A']);
    expect(home.scoring!.rows.map((r) => [r.name, r.values, r.noted])).toEqual([
      ['Gabrielle Moll', [1, 1], true],
      ['Sarah Anton', [null, 1], false],
    ]);
    expect(view.notedFrom).toBe(NOTE);
  });

  it('matches a line under the stats sheet\'s short name on the jersey and last name', () => {
    const b = box([{ name: 'E. Borges', jersey: '11', field: { goals: 0, assists: 1 }, goalkeeping: null }]);
    const home = homeSide(notedModel(), withNote(b, [credit('Emry Borges', '11', { goals: 1 })]));
    expect(home.scoring!.rows.map((r) => [r.name, r.values, r.noted])).toEqual([['E. Borges', [1, 1], true]]);
  });

  it('gives a side with no box score tables from its note alone, saves included', () => {
    const credits = [
      credit('Gabrielle Moll', '9', { goals: 1 }),
      credit('Emry Borges', null, { goals: 1 }),
      credit('Lacey Sebastian Carattini', '1', { saves: 7 }),
    ];
    const home = homeSide(notedModel(), withNote(undefined, credits));
    expect(home.empty).toBeNull();
    expect(home.scoring!.rows.map((r) => [r.name, r.values, r.noted])).toEqual([
      ['Gabrielle Moll', [1], true],
      ['Emry Borges', [1], true],
    ]);
    expect(home.goalies!.rows.map((r) => [r.name, r.values, r.noted])).toEqual([['Lacey Sebastian Carattini', [7], true]]);
    // The noted goals count toward the side's score like entered ones.
    const score = GAME.home.score!;
    expect(home.notes).toEqual(score === 2 ? [] : [`Scorers are entered for 2 of the ${score} goals.`]);
  });

  it('quotes no note when nothing was added from one', () => {
    expect(buildGameStatsView(notedModel(), withNote(scorer(1), []))!.notedFrom).toBeNull();
  });

  it('renders the mark on a noted row and quotes the note under the tables', () => {
    const html = renderToStaticMarkup(
      createElement(GameStats, { model: notedModel(), lookup: withNote(undefined, [credit('Emry Borges', '11', { goals: 1 })]) }),
    );
    const text = textOf(html);
    expect(text).toContain('Emry Borges * (includes a game note)');
    expect(text).toContain(`* Also counts what was written in MaxPreps’ note for this game but not entered as stats: “${NOTE}”.`);
  });

  it("adds on each game page exactly what the team page adds from that game's note", () => {
    for (const team of getAllPlayerStatsWithNotes()) {
      for (const c of team.noteCredits) {
        const view = buildGameStatsView(buildGameView(gameIdToParam(c.contestId))!)!;
        expect(view, `${team.slug} ${c.contestId}`).not.toBeNull();
        expect(view.notedFrom).toBe(c.note);
        const side = view.sides.find((s) => s.key === team.slug)!;
        const rows = [...(side.scoring?.rows ?? []), ...(side.goalies?.rows ?? [])].filter((r) => r.noted);
        expect(rows.length, `${team.slug} ${c.contestId} ${c.fullName}`).toBeGreaterThan(0);
      }
    }
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
    const m = model();
    const html = renderToStaticMarkup(createElement(GameStats, { model: m, lookup: only(HOME, b) }));
    const text = textOf(html);
    expect(html).toContain('id="game-stats-kicker"');
    expect(text).toContain('Game stats');
    expect(text).toContain(`${m.home.name} scoring in this game`);
    expect(text).toContain(`${m.home.name} goalkeeping in this game`);
    expect(text).toContain('No stats entered on MaxPreps for this game.');
    expect(text).toContain('G goals · Sv saves.');
    expect(text).not.toContain(TIEBREAK_CAVEAT);
    expect(renderToStaticMarkup(createElement(GameStats, { model: m, lookup: nothing }))).toBe('');
  });
});

describe('every box score in data/player-stats.json', () => {
  const games = new Map(getSnapshot().games.map((g) => [g.contestId, g]));
  const finals = [...new Set(getPlayerStats().teams.flatMap((t) => (t.games ?? []).map((b) => b.contestId)))]
    .map((id) => games.get(id))
    .filter((g): g is Game => g?.status === 'final');

  it('gives a game a section only with a table in it, and no scoring row of zeros', () => {
    for (const game of finals) {
      const view = buildGameStatsView(buildGameView(gameIdToParam(game.contestId))!);
      if (!view) continue;
      expect(view.sides.some((s) => s.scoring || s.goalies), game.contestId).toBe(true);
      for (const side of view.sides) {
        expect(Boolean(side.empty), `${game.contestId} ${side.key}`).toBe(!side.scoring && !side.goalies);
        for (const row of side.scoring?.rows ?? []) expect(row.values.some((v) => (v ?? 0) > 0), row.name).toBe(true);
      }
    }
  });

  it('never says a team whose latest read failed entered nothing', () => {
    for (const t of getPlayerStats().teams) {
      if (t.status === 'ok' || t.status === 'none') continue;
      for (const g of getSnapshot().games) {
        if (g.home.slug !== t.slug && g.away.slug !== t.slug) continue;
        const entry = getGameStatsEntry(g.contestId, t.slug as TeamSlug);
        if (!entry.box) expect(entry.unread, `${t.slug} ${g.contestId}`).toBe(true);
      }
    }
  });
});
