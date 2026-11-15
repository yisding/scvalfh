/**
 * lib/postseason/sds-sheet-results.ts — decideSdsSheet's decisions and the published games
 * applySdsSheetResults builds from them, on the scenarios tests/sds-sheet-results.test.ts runs (2025 sheet over 2025 MaxPreps rows).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sdsDivisionTeams } from '../lib/postseason/sds-brackets-file';
import {
  applySdsSheetResults,
  decideSdsSheet,
  type SdsSheetApplyInput,
} from '../lib/postseason/sds-sheet-results';
import { parseSdsBracketTab, type SdsSheetResult } from '../lib/sources/sds-bracket-sheet';
import type { Game } from '../lib/types';
import { SDS_2025_WINDOW, sdsGames2025, seedsFromHistory } from './fixtures/sds/brackets-2025';
import { REPO } from './helpers';

const file = seedsFromHistory('sds');
const SHEET = 'https://docs.google.com/spreadsheets/d/1P9J_VFYljarF0IxnE4SP8zHey9T6y97IHz6NZZbaBWg/edit';
const AT = '2025-11-13T15:00:00Z';

const results: SdsSheetResult[] = file.divisions.flatMap((d) => {
  const text = readFileSync(path.join(REPO, 'tests', 'fixtures', 'sds', 'sheet-2025', `${d.id}.csv`), 'utf8');
  const read = parseSdsBracketTab(text, { id: d.id, label: d.label, teams: sdsDivisionTeams(d) });
  if (!read.recognised) throw new Error(read.reason);
  return read.results;
});

const maxpreps = sdsGames2025();
const input = (games: readonly Game[], extra: Partial<SdsSheetApplyInput> = {}): SdsSheetApplyInput => ({
  games,
  results,
  file,
  windowFirst: SDS_2025_WINDOW.first,
  sheetUrl: SHEET,
  fetchedAt: AT,
  ...extra,
});

const unscored = (g: Game): Game => ({
  ...g,
  status: 'scheduled',
  home: { ...g.home, score: null, result: null },
  away: { ...g.away, score: null, result: null },
  decider: null,
  otPeriods: 0,
  isOt: false,
});

/**
 * decideSdsSheet and applySdsSheetResults on one input, checked for what they must hold whatever the scenario: the
 * input is left as it was, an existing game with no decision is returned as the same object, a `cifsds:` game of an
 * earlier run is dropped and decided again (never duplicated), and the result is sorted by date then contest id with
 * the published games included. The known values are each scenario's own assertions.
 */
function run(i: SdsSheetApplyInput) {
  const before = structuredClone(i);
  const d = decideSdsSheet(i);
  const whole = applySdsSheetResults(i);
  expect(i).toEqual(before);
  const mine = i.games.filter((g) => !g.contestId.startsWith('cifsds:'));
  expect(whole.games).toHaveLength(mine.length + d.added.length + d.listed.length);
  expect(new Set(whole.games.map((g) => g.contestId)).size).toBe(whole.games.length);
  for (const g of mine) {
    const out = whole.games.find((o) => o.contestId === g.contestId);
    if (d.decisions.has(g.contestId)) expect(out).not.toBe(g);
    else expect(out).toBe(g);
  }
  const keys = whole.games.map((g) => `${g.dateKey}|${g.contestId}`);
  expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  return { d, whole, out: (id: string) => whole.games.find((g) => g.contestId === id)! };
}

const target = maxpreps.find((g) => g.home.slug === 'del-norte' && g.away.slug === 'mira-mesa')!;
const fixture = (date: string) => ({
  division: 'division-2',
  dateKey: date,
  time: '19:00',
  venue: null,
  teams: ['mira-mesa', 'del-norte'] as ['mira-mesa', 'del-norte'],
});
const FOUR_ABSENT = [
  'cifsds:granite-hills-at-helix',
  'cifsds:westview-at-bonita-vista',
  'cifsds:helix-at-rancho-buena-vista',
  'cifsds:rancho-buena-vista-at-olympian',
];
const scoreOf = (g: Game) => [g.home.score, g.away.score];

describe('decideSdsSheet decides what the 2025 sheet says, and applySdsSheetResults applies it', () => {
  it('on the full 2025 sheet: the four absent games are added, nothing else is decided', () => {
    const { d, whole } = run(input(maxpreps));
    expect(d.added.map((g) => g.contestId)).toEqual(FOUR_ABSENT);
    expect(d.added.every((g) => g.status === 'final')).toBe(true);
    expect(d.decisions.size).toBe(0);
    expect(d.steps).toEqual([]);
    expect(d.listed).toEqual([]);
    expect(d.agreed).toBe(23);
    expect(d.disagreements).toEqual([]);
    expect(whole.games).toHaveLength(maxpreps.length + 4);
  });

  it('on a MaxPreps contest with no score (rule 2)', () => {
    const games = maxpreps.map((g) => (g.contestId === target.contestId ? unscored(g) : g));
    const { d, out } = run(input(games));
    expect([...d.decisions.keys()]).toEqual([target.contestId]);
    const decision = d.decisions.get(target.contestId)!;
    expect(decision).toMatchObject({ kind: 'score', rule: 'score-pending', fetchedAt: AT, sheetUrl: SHEET });
    expect(decision.kind === 'score' && decision.result).toMatchObject({ winner: 'del-norte', loser: 'mira-mesa', winnerGoals: 1, loserGoals: 0, otPeriods: 1 });
    expect(d.agreed).toBe(22);
    expect(d.added.map((g) => g.contestId)).toEqual(FOUR_ABSENT);
    // Del Norte hosts: the sheet's 1-0 (OT) lands home 1, away 0.
    expect(out(target.contestId).status).toBe('final');
    expect(scoreOf(out(target.contestId))).toEqual([1, 0]);
  });

  it('on a MaxPreps score the sheet disagrees with (rule 1)', () => {
    const off: Game = { ...target, home: { ...target.home, score: 6 } };
    const { d, out } = run(input(maxpreps.map((g) => (g.contestId === target.contestId ? off : g))));
    expect(d.decisions.size).toBe(0);
    expect(d.disagreements).toHaveLength(1);
    expect(d.disagreements[0]).toContain(target.contestId);
    expect(d.disagreements[0]).toMatch(/MaxPreps has Mira Mesa 0, Del Norte 6; the Section's sheet has Del Norte 1-0 \(OT\) over Mira Mesa/);
    expect(d.agreed).toBe(22);
    expect(scoreOf(out(target.contestId))).toEqual([6, target.away.score]);
  });

  it('on a score an earlier run took from the sheet, corrected by the sheet', () => {
    const first = applySdsSheetResults(input(maxpreps.map((g) => (g.contestId === target.contestId ? unscored(g) : g)))).games;
    expect(first).toHaveLength(30);
    const corrected = results.map((r) =>
      r.winner === 'del-norte' && r.loser === 'mira-mesa'
        ? { ...r, winner: 'mira-mesa', loser: 'del-norte', winnerGoals: 2, loserGoals: 1, otPeriods: 0, scoreText: '2-1' }
        : r,
    );
    const { d, out } = run(input(first, { results: corrected }));
    expect([...d.decisions.keys()]).toEqual([target.contestId]);
    expect(d.decisions.get(target.contestId)).toMatchObject({ kind: 'score', result: { winner: 'mira-mesa', winnerGoals: 2, loserGoals: 1 } });
    expect(d.added.map((g) => g.contestId)).toEqual(FOUR_ABSENT);
    expect(d.agreed).toBe(22);
    expect(scoreOf(out(target.contestId))).toEqual([1, 2]);
  });

  it('on a repeated result for one pair, whose first fill is a step of its own', () => {
    const r = results.find((x) => x.winner === 'del-norte' && x.loser === 'mira-mesa')!;
    const games = maxpreps.map((g) => (g.contestId === target.contestId ? unscored(g) : g));
    const { d, whole, out } = run(input(games, { results: [r, { ...r, winnerGoals: 5, scoreText: '5-0' }] }));
    expect(d.steps.map((s) => [s.contestId, s.decision.kind])).toEqual([[target.contestId, 'score'], [target.contestId, 'score']]);
    expect(d.steps.map((s) => s.decision.kind === 'score' && s.decision.result.winnerGoals)).toEqual([1, 5]);
    // The last decision wins.
    expect(d.decisions.size).toBe(1);
    expect(d.decisions.get(target.contestId)).toBe(d.steps[1].decision);
    expect(scoreOf(out(target.contestId))).toEqual([5, 0]);
    expect(whole.filled).toHaveLength(2);
  });

  it('on a fixture MaxPreps has no time for (rule 4), and one it has no contest for (rule 5, score pending)', () => {
    const tba: Game = { ...unscored(target), isTimeTba: true, dateLocal: `${target.dateKey}T16:00:00` };
    const timed = run(input(maxpreps.map((g) => (g.contestId === target.contestId ? tba : g)), { results: [], fixtures: [fixture(target.dateKey)] }));
    expect(timed.d.steps).toEqual([{ contestId: target.contestId, decision: { kind: 'time', time: '19:00', sheetUrl: SHEET } }]);
    expect(timed.d.added).toEqual([]);
    expect(timed.out(target.contestId).dateLocal).toBe(`${target.dateKey}T19:00:00`);
    expect(timed.out(target.contestId).provenance.schedule).toBe('cifsds-sheet');
    expect(timed.whole.timed).toHaveLength(1);

    const without = maxpreps.filter((g) => g.contestId !== target.contestId);
    const listed = run(input(without, { results: [], fixtures: [fixture('2025-11-12')], today: '2025-11-13' }));
    expect(listed.d.decisions.size).toBe(0);
    expect(listed.d.added).toEqual([]);
    expect(listed.d.listed.map((g) => [g.contestId, g.status, g.dateKey])).toEqual([['cifsds:mira-mesa-at-del-norte', 'score-pending', '2025-11-12']]);
    expect(listed.whole.games).toHaveLength(without.length + 1);
  });

  it('with a cifsds: game from an earlier run in the input, dropped and decided again', () => {
    const without = maxpreps.filter((g) => g.contestId !== target.contestId);
    const earlier = applySdsSheetResults(input(without)).games;
    expect(earlier.filter((g) => g.contestId.startsWith('cifsds:'))).toHaveLength(5);
    const { d } = run(input(earlier));
    expect(d.added.map((g) => g.contestId)).toEqual([...FOUR_ABSENT, 'cifsds:mira-mesa-at-del-norte']);
    expect(d.decisions.size).toBe(0);
  });
});

describe('a game with no decision', () => {
  it('is returned as the same object', () => {
    const games = maxpreps.map((g) => (g.contestId === target.contestId ? unscored(g) : g));
    const out = applySdsSheetResults(input(games)).games;
    const { d } = run(input(games));
    expect(d.decisions.size).toBe(1);
    for (const g of games) {
      if (d.decisions.has(g.contestId)) continue;
      expect(out.find((o) => o.contestId === g.contestId)).toBe(g);
    }
  });
});

describe('decideSdsSheet', () => {
  it('does not mutate its input', () => {
    const games = maxpreps.map((g) => (g.contestId === target.contestId ? { ...unscored(g), isTimeTba: true } : g));
    const i = input(games, { fixtures: [fixture(target.dateKey)] });
    const before = structuredClone(i);
    decideSdsSheet(i);
    expect(i).toEqual(before);
  });
});
