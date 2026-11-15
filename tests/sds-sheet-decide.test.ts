/**
 * lib/postseason/sds-sheet-results.ts — decideSdsSheet + applySdsSheetDecision against the composed
 * applySdsSheetResults, on the scenarios tests/sds-sheet-results.test.ts runs (2025 sheet over 2025 MaxPreps rows).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sdsDivisionTeams } from '../lib/postseason/sds-brackets-file';
import {
  applySdsSheetDecision,
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

/** decide, apply each game its decision, append the published games, sort as the composed function does. */
function composed(i: SdsSheetApplyInput) {
  const d = decideSdsSheet(i);
  const games = i.games
    .filter((g) => !g.contestId.startsWith('cifsds:'))
    .map((g) => {
      const decision = d.decisions.get(g.contestId);
      return decision ? applySdsSheetDecision(g, decision) : g;
    });
  games.push(...d.added, ...d.listed);
  games.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId));
  return { d, games };
}

function expectSame(i: SdsSheetApplyInput) {
  const { d, games } = composed(i);
  const whole = applySdsSheetResults(i);
  expect(games).toEqual(whole.games);
  expect(d.added).toEqual(whole.added);
  expect(d.listed).toEqual(whole.listed);
  expect(d.agreed).toBe(whole.agreed);
  expect(d.disagreements).toEqual(whole.disagreements);
  expect(d.steps.filter((s) => s.decision.kind === 'score')).toHaveLength(whole.filled.length);
  expect(d.steps.filter((s) => s.decision.kind === 'time')).toHaveLength(whole.timed.length);
  return { d, whole };
}

const target = maxpreps.find((g) => g.home.slug === 'del-norte' && g.away.slug === 'mira-mesa')!;
const fixture = (date: string) => ({
  division: 'division-2',
  dateKey: date,
  time: '19:00',
  venue: null,
  teams: ['mira-mesa', 'del-norte'] as ['mira-mesa', 'del-norte'],
});

describe('decideSdsSheet + applySdsSheetDecision equal applySdsSheetResults', () => {
  it('on the full 2025 sheet: the four absent games are added, nothing else is decided', () => {
    const { d } = expectSame(input(maxpreps));
    expect(d.added).toHaveLength(4);
    expect(d.decisions.size).toBe(0);
  });

  it('on a MaxPreps contest with no score (rule 2)', () => {
    const games = maxpreps.map((g) => (g.contestId === target.contestId ? unscored(g) : g));
    const { d, whole } = expectSame(input(games));
    expect([...d.decisions.keys()]).toEqual([target.contestId]);
    expect(whole.filled).toHaveLength(1);
  });

  it('on a MaxPreps score the sheet disagrees with (rule 1)', () => {
    const off: Game = { ...target, home: { ...target.home, score: 6 } };
    const { d } = expectSame(input(maxpreps.map((g) => (g.contestId === target.contestId ? off : g))));
    expect(d.disagreements).toHaveLength(1);
  });

  it('on a score an earlier run took from the sheet, corrected by the sheet', () => {
    const first = applySdsSheetResults(input(maxpreps.map((g) => (g.contestId === target.contestId ? unscored(g) : g)))).games;
    const corrected = results.map((r) =>
      r.winner === 'del-norte' && r.loser === 'mira-mesa'
        ? { ...r, winner: 'mira-mesa', loser: 'del-norte', winnerGoals: 2, loserGoals: 1, otPeriods: 0, scoreText: '2-1' }
        : r,
    );
    expectSame(input(first, { results: corrected }));
  });

  it('on a repeated result for one pair, whose first fill is a step of its own', () => {
    const r = results.find((x) => x.winner === 'del-norte' && x.loser === 'mira-mesa')!;
    const games = maxpreps.map((g) => (g.contestId === target.contestId ? unscored(g) : g));
    const { d, whole } = expectSame(input(games, { results: [r, { ...r, winnerGoals: 5, scoreText: '5-0' }] }));
    expect(d.steps).toHaveLength(2);
    expect(whole.filled).toHaveLength(2);
  });

  it('on a fixture MaxPreps has no time for (rule 4), and one it has no contest for (rule 5, score pending)', () => {
    const tba: Game = { ...unscored(target), isTimeTba: true, dateLocal: `${target.dateKey}T16:00:00` };
    const timed = expectSame(input(maxpreps.map((g) => (g.contestId === target.contestId ? tba : g)), { results: [], fixtures: [fixture(target.dateKey)] }));
    expect(timed.whole.timed).toHaveLength(1);
    const without = maxpreps.filter((g) => g.contestId !== target.contestId);
    const listed = expectSame(input(without, { results: [], fixtures: [fixture('2025-11-12')], today: '2025-11-13' }));
    expect(listed.whole.listed.map((g) => g.status)).toEqual(['score-pending']);
  });

  it('with a cifsds: game from an earlier run in the input, dropped and decided again', () => {
    const without = maxpreps.filter((g) => g.contestId !== target.contestId);
    expectSame(input(applySdsSheetResults(input(without)).games));
  });
});

describe('a game with no decision', () => {
  it('is returned as the same object', () => {
    const games = maxpreps.map((g) => (g.contestId === target.contestId ? unscored(g) : g));
    const out = applySdsSheetResults(input(games)).games;
    const { d } = composed(input(games));
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
