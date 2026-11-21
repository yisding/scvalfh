/**
 * Games between two levels (lib/cross-level.ts): MaxPreps' "Non Varsity Opponent" in a varsity schedule and
 * "Non JV Opponent" in a JV schedule are named in words, explained on the game page, never a series, and count in no
 * table or rating.
 */
import { describe, expect, it } from 'vitest';

import {
  CROSS_LEVEL_SUB,
  NON_JV_OPPONENT_ID,
  NON_VARSITY_OPPONENT_ID,
  crossLevelNote,
  crossLevelOpponentOf,
  isCrossLevelGame,
  withCrossLevelNames,
} from '../lib/cross-level';
import { buildJvGameView, jvGameTitle } from '../components/jv/jv-game-view';
import { getSnapshot } from '../lib/data';
import { getJvClassification, getJvGameSlug, getJvGames } from '../lib/jv/jv';
import { ratingGames } from '../lib/ratings/ratings';
import { TEAMS } from '../lib/teams';
import { game } from './game-builder';

describe('the cross-level placeholders', () => {
  it('are recognised by MaxPreps id, never by name', () => {
    expect(crossLevelOpponentOf(NON_VARSITY_OPPONENT_ID)?.kind).toBe('non-varsity');
    expect(crossLevelOpponentOf(NON_JV_OPPONENT_ID)?.kind).toBe('non-jv');
    expect(crossLevelOpponentOf('b6e1f3f8-f345-4829-80a4-0653a9a36a1d')).toBeUndefined(); // Tournament Opponent
    expect(crossLevelOpponentOf(null)).toBeUndefined();
  });

  it('renames only the placeholder side, and leaves every other game as it is', () => {
    const plain = game({ home: 'cupertino', away: 'los-gatos' });
    const cross = game({ home: 'cupertino', away: 'los-gatos', league: false });
    const placed = { ...cross, away: { ...cross.away, slug: null, teamId: NON_JV_OPPONENT_ID, name: 'Non JV Opponent' } };
    const [a, b] = withCrossLevelNames([plain, placed]);
    expect(a).toBe(plain);
    expect(b.away.name).toBe('Non-JV team');
    expect(b.home).toEqual(placed.home);
    expect(isCrossLevelGame(b)).toBe(true);
    expect(crossLevelNote(b, 'Cupertino')).toMatch(/^MaxPreps lists the opponent only as “Non JV Opponent”: Cupertino’s JV played/);
    expect(crossLevelNote(plain, 'Cupertino')).toBeNull();
    expect(CROSS_LEVEL_SUB).not.toBe('');
  });
});

describe('over the bundled files', () => {
  const varsity = getSnapshot().games.filter(isCrossLevelGame);
  const jv = getJvGames().filter(isCrossLevelGame);

  it('no placeholder is printed under MaxPreps’ name', () => {
    for (const g of [...varsity, ...jv]) {
      for (const side of [g.home, g.away]) expect(side.name).not.toMatch(/^Non (Varsity|JV) Opponent$/);
    }
  });

  it('a cross-level game counts in no league table, no JV table and no rating', () => {
    for (const g of varsity) {
      expect(g.countsFor).toBeNull();
      expect(g.postseason).toBeNull();
    }
    for (const g of jv) expect(getJvClassification(g.contestId)?.kind).not.toBe('league');
    const rated = new Set(ratingGames(TEAMS, getSnapshot().games).map((g) => g.contestId));
    for (const g of varsity) expect(rated.has(g.contestId)).toBe(false);
  });

  it('a JV game page’s title says JV only of the JV side, never of the placeholder', () => {
    for (const g of jv) {
      const model = buildJvGameView(getJvGameSlug(g.contestId)!)!;
      const title = jvGameTitle(model);
      expect(title).not.toMatch(/Non-JV team JV/);
      const school = model.away.team ? model.away : model.home;
      expect(title).toContain(`${school.label} JV`);
    }
  });
});
