/**
 * The decide/apply split of lib/crosscheck/backfill.ts and lib/crosscheck/crosscheck.ts (the claims
 * re-architecture, P6). `applyBackfill` and `reconcile` are decide + apply, so this file does not compare one with
 * the other. Every scenario tests/backfill.test.ts and tests/crosscheck.test.ts build runs here again with both
 * functions wrapped, and each call checks properties of the decisions themselves (listed in `checkBackfill` and
 * `checkReconcile`): what a decision does to its game, that the rule-2 games are the fixtures they consume, in the
 * order the decision says, and that decide leaves its input alone. The direct cases at the end pin decisions to
 * known values. Those files are imported, not copied, so a scenario added there is checked here too.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { BackfillInput } from '../lib/crosscheck/backfill';
import type { ReconcileOptions } from '../lib/crosscheck/crosscheck';
import { getDivision } from '../lib/leagues';
import type { SbliveGame } from '../lib/sources/sblive';
import { getTeamBySlug } from '../lib/teams';
import type { Game, OfficialFixture } from '../lib/types';
import { game } from './helpers';

const calls = { backfill: 0, backfillDecided: 0, backfillCreated: 0, reconcile: 0, reconcileDecided: 0 };

/** The data part of a backfill input: `consulted` is a function, so it is left out of the snapshot. */
function backfillData(input: BackfillInput) {
  return structuredClone({
    games: input.games,
    unmatched: input.unmatched,
    sblive: input.sblive,
    today: input.today,
    previous: input.previous,
    sbliveFailed: input.sbliveFailed,
    fetchedAt: input.fetchedAt,
    moves: input.moves,
  });
}

const realBackfill = await vi.importActual<typeof import('../lib/crosscheck/backfill')>('../lib/crosscheck/backfill');
const realCrosscheck = await vi.importActual<typeof import('../lib/crosscheck/crosscheck')>('../lib/crosscheck/crosscheck');

/** Properties of a backfill decision that hold in every scenario; `result` is the composed result, checked only against these. */
function checkBackfill(input: BackfillInput, decided: ReturnType<typeof realBackfill.decideBackfill>, result: ReturnType<typeof realBackfill.applyBackfill>) {
  const ids = new Set(input.games.map((g) => g.contestId));
  // A decision names an existing game, and a game it names comes out final, with si.com's score, url and a backfill note.
  for (const [id, decision] of decided.byContestId) {
    expect(ids.has(id), id).toBe(true);
    const i = input.games.findIndex((g) => g.contestId === id);
    const out = result.games[i];
    expect(out.contestId).toBe(id);
    expect(out.status).toBe('final');
    expect(out.provenance.scores).toBe('sblive');
    if (decision.kind === 'override') {
      expect(out.home.score).toBe(decision.score.home);
      expect(out.away.score).toBe(decision.score.away);
      expect(out.provenance.backfill?.rule).toBe(decision.rule);
      expect(out.urls.sblive).toBe(decision.row.url);
    } else {
      expect(out.home.score).toBe(decision.published.home.score);
      expect(out.urls.sblive).toBe(decision.published.sbliveUrl);
    }
  }
  // The rule-2 games are appended after the existing games, in `created` order, this run's fills before the carried
  // ones, each a new contest for a fixture that was unmatched and no longer is.
  expect(result.games.slice(0, input.games.length).map((g) => g.contestId)).toEqual(input.games.map((g) => g.contestId));
  expect(result.games.slice(input.games.length).map((g) => g.contestId)).toEqual(decided.created.map((c) => c.game.contestId));
  const carriedFlags = decided.created.map((c) => c.carried);
  expect(carriedFlags).toEqual([...carriedFlags].sort((a, b) => Number(a) - Number(b)));
  expect(new Set(result.games.map((g) => g.contestId)).size).toBe(result.games.length);
  expect(decided.consumed).toStrictEqual(decided.created.map((c) => c.fixture));
  for (const c of decided.created) {
    expect(ids.has(c.game.contestId)).toBe(false);
    expect(input.unmatched).toContain(c.fixture);
    expect(result.unmatched).not.toContain(c.fixture);
    expect(c.game.official?.fixtureId).toBe(c.fixture.id);
    expect(c.game.status).toBe('final');
  }
  expect(result.unmatched).toHaveLength(input.unmatched.length - decided.created.length);
  // A game with no decision is the same object; a carried game is the previous snapshot's own.
  input.games.forEach((g, i) => {
    if (!decided.byContestId.has(g.contestId)) expect(result.games[i]).toBe(g);
    else expect(result.games[i]).not.toBe(g);
  });
  decided.created.forEach((c, i) => {
    if (c.carried) expect(result.games[input.games.length + i]).toBe(c.game);
  });
}

/** Properties of a reconcile decision: a decided game gains exactly the conflict, nothing else; the rest are untouched. */
function checkReconcile(games: readonly Game[], decided: ReturnType<typeof realCrosscheck.decideReconcile>, result: ReturnType<typeof realCrosscheck.reconcile>) {
  expect(result.games).toHaveLength(games.length);
  for (const [id, decision] of decided.byContestId) {
    const i = games.findIndex((g) => g.contestId === id);
    expect(i, id).toBeGreaterThanOrEqual(0);
    const out = result.games[i];
    expect(out.provenance.scoreConflict).toEqual(decision.scoreConflict);
    // MaxPreps' scores stand (D2 rule 5: a plain disagreement is published, never resolved).
    expect(out.home.score).toBe(games[i].home.score);
    expect(out.away.score).toBe(games[i].away.score);
    expect(out.status).toBe(games[i].status);
  }
}

vi.mock('../lib/crosscheck/backfill', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/crosscheck/backfill')>();
  const applyBackfill: typeof real.applyBackfill = (input) => {
    const result = real.applyBackfill(input);
    calls.backfill += 1;

    const before = backfillData(input);
    const decided = real.decideBackfill(input);
    expect(backfillData(input)).toStrictEqual(before);

    checkBackfill(input, decided, result);
    calls.backfillDecided += decided.byContestId.size;
    calls.backfillCreated += decided.created.length;
    return result;
  };
  return { ...real, applyBackfill };
});

vi.mock('../lib/crosscheck/crosscheck', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/crosscheck/crosscheck')>();
  const reconcile = (games: readonly Game[], sbliveGames: readonly SbliveGame[], opts: ReconcileOptions) => {
    const result = real.reconcile(games, sbliveGames, opts);
    calls.reconcile += 1;

    const before = structuredClone({ games, sbliveGames, opts });
    const decided = real.decideReconcile(games, sbliveGames, opts);
    expect(structuredClone({ games, sbliveGames, opts })).toStrictEqual(before);

    checkReconcile(games, decided, result);
    calls.reconcileDecided += decided.byContestId.size;
    return result;
  };
  return { ...real, reconcile };
});

// Every describe block of these files runs here, through the wrapped functions above.
await import('./backfill.test');
await import('./crosscheck.test');

describe('the decisions themselves, on known inputs', () => {
  const { decideBackfill, applyBackfillDecision } = realBackfill;
  const sbSide = (slug: string, score: number) => {
    const t = getTeamBySlug(slug)!;
    return { name: t.name, sbliveTeamId: t.external.sbliveTeamId ?? null, slug, via: 'team-id' as const, score };
  };
  const sbRow = (id: string, date: string, a: [string, number], b: [string, number]): SbliveGame => ({
    sbliveGameId: id,
    dateIso: `${date}T16:00:00.000-07:00`,
    dateKey: date,
    sides: [sbSide(...a), sbSide(...b)].sort((x, y) => x.slug.localeCompare(y.slug)) as SbliveGame['sides'],
    isFinal: true,
    isScored: true,
    url: `https://www.si.com/high-school/stats/california/field-hockey/games/${id}-x-vs-y`,
    gameTypeLabel: null,
    origin: 'team-games',
  });
  const fixtureOf = (date: string, away: string, home: string): OfficialFixture => ({
    id: `pcal:${date}:${away}@${home}`,
    league: 'pcal',
    division: 'pcal',
    dateKey: date,
    time: '16:00',
    awayName: getTeamBySlug(away)!.name,
    homeName: getTeamBySlug(home)!.name,
    awaySlug: away,
    homeSlug: home,
    source: getDivision('pcal').official.mode === 'none' ? (undefined as never) : (getDivision('pcal').official as { source: OfficialFixture['source'] }).source,
  });
  const base = { unmatched: [], sblive: [], today: '2026-10-02', previous: null, sbliveFailed: false, fetchedAt: '2026-10-02T15:00:00.000Z' } satisfies Partial<BackfillInput>;
  const run = (over: Partial<BackfillInput>) => decideBackfill({ ...base, games: [], ...over });

  it('rule 3: a score-pending contest takes si.com’s Final; a finished one and an unrelated one are not decided', () => {
    const pending = game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending', contestId: 'f06f9d76-c8a1-4358-b7a9-1c97c2d686f0' });
    const unrelated = game({ home: 'saratoga', away: 'lynbrook', date: '2026-09-29', hs: 1, as: 0 });
    const d = run({ games: [unrelated, pending], sblive: [sbRow('6499423', '2026-09-29', ['carmel', 0], ['stevenson', 9])] });
    expect([...d.byContestId.keys()]).toEqual([pending.contestId]);
    expect(d.byContestId.get(pending.contestId)).toMatchObject({ kind: 'override', rule: 'score-pending', score: { home: 9, away: 0 } });
    expect(d.created).toEqual([]);
    expect(d.rows.map((r) => [r.contestId, r.rule, r.sblive])).toEqual([[pending.contestId, 'score-pending', { home: 9, away: 0 }]]);
    expect(applyBackfillDecision(unrelated, d.byContestId.get(unrelated.contestId))).toBe(unrelated);
    expect(applyBackfillDecision(pending, d.byContestId.get(pending.contestId)).home.score).toBe(9);
  });

  it('rule 2: absent fixtures become new games in the order of the fixtures, and each leaves unmatched', () => {
    const first = fixtureOf('2026-09-04', 'greenfield', 'santa-catalina');
    const second = fixtureOf('2026-09-30', 'hollister', 'greenfield');
    const rows = [
      sbRow('6541425', '2026-09-04', ['greenfield', 0], ['santa-catalina', 1]),
      sbRow('6541426', '2026-09-30', ['hollister', 2], ['greenfield', 3]),
    ];
    const d = run({ unmatched: [first, second], sblive: rows });
    expect(d.byContestId.size).toBe(0);
    expect(d.created.map((c) => [c.game.contestId, c.fixture.id, c.carried])).toEqual([
      ['sblive:6541425', first.id, false],
      ['sblive:6541426', second.id, false],
    ]);
    expect(d.created[0].game.home).toMatchObject({ slug: 'santa-catalina', score: 1 });
    expect(d.created[1].game.home).toMatchObject({ slug: 'greenfield', score: 3 });
    expect(d.consumed).toEqual([first, second]);
    expect(d.unmatched).toEqual([]);
    // Only the second fixture's row: the first stays unmatched.
    const one = run({ unmatched: [first, second], sblive: [rows[1]] });
    expect(one.created.map((c) => c.game.contestId)).toEqual(['sblive:6541426']);
    expect(one.unmatched).toEqual([first]);
  });

  it('reconcile: a plain disagreement is a decision on that game only, carrying si.com’s numbers', () => {
    const agree = game({ home: 'los-altos', away: 'cupertino', hs: 4, as: 0, date: '2026-09-23' });
    const differ = game({ home: 'homestead', away: 'saint-francis', hs: 0, as: 7, date: '2026-09-24' });
    const d = realCrosscheck.decideReconcile(
      [agree, differ],
      [sbRow('11', '2026-09-23', ['los-altos', 4], ['cupertino', 0]), sbRow('12', '2026-09-24', ['homestead', 1], ['saint-francis', 7])],
      { sbliveFetchedAt: '2026-09-29T15:00:00.000Z' },
    );
    expect([...d.byContestId.keys()]).toEqual([differ.contestId]);
    expect(d.byContestId.get(differ.contestId)?.scoreConflict.sblive).toEqual({ home: 1, away: 7 });
    expect(d.report.agreements).toBe(1);
    expect(d.report.conflicts).toHaveLength(1);
    expect(realCrosscheck.applyReconcile(agree, undefined)).toBe(agree);
  });
});

describe('decide/apply split coverage', () => {
  afterAll(() => {
    // The imported scenarios reached the wrappers, with decisions of every kind to compare.
    expect(calls.backfill).toBeGreaterThan(30);
    expect(calls.backfillDecided).toBeGreaterThan(10);
    expect(calls.backfillCreated).toBeGreaterThan(3);
    expect(calls.reconcile).toBeGreaterThan(5);
    expect(calls.reconcileDecided).toBeGreaterThan(3);
  });

  it('runs the composed functions through the wrappers', () => {
    expect(calls.backfill + calls.reconcile).toBeGreaterThan(0);
  });
});
