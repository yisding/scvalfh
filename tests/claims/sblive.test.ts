/**
 * si.com's claims (docs/DATA-SOURCES.md §4.2): seeded from a snapshot and rewritten from each run's publication,
 * one fill per si.com value a game published (each rule-2 `sblive:` game on a fixture of its own) and one mark per
 * disagreement a game with no fill published. Rule 10 and a run that reads no si.com data carry from them exactly
 * as they carried from the previous snapshot's games, and the stage's games are the step's decisions applied to its
 * input, whether the step recorded them (the real one) or they are read off the games it returned (a stand-in).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ledgerEditor } from '../../lib/claims/editor';
import { claimsFromSnapshot } from '../../lib/claims/from-snapshot';
import { fixtureOfContest } from '../../lib/claims/published';
import { conflictsFromSnapshot, decisionsFromSbliveStep, storedConflictsOf, storedFillsOf, writeBackSbliveClaims } from '../../lib/claims/sources/sblive';
import { ClaimStore } from '../../lib/claims/store';
import type { ClaimsFile } from '../../lib/claims/types';
import { earlierFillsOf } from '../../lib/crosscheck/backfill';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Game, Snapshot } from '../../lib/types';
import { REPO, corpusDir, corpusSnapshotPath } from '../helpers';
import { snapshotOf, writeTempVariant } from '../pipeline/support/run-corpus';
import { resolveSbliveStage } from '../support/list-steps';

const committed = loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data', 'snapshot.json'), 'utf8')) as unknown);
const own = loadSnapshot(JSON.parse(readFileSync(corpusSnapshotPath('all-2026-10-02'), 'utf8')) as unknown);
const editor = ledgerEditor(committed.fetchedAt).view;
const NOW = '2026-11-16T15:00:00.000Z';
const STEPS = { official: stepOfficial, sblive: stepSblive };
const seeded = (snapshot: Snapshot) => ClaimStore.fromFile(claimsFromSnapshot(snapshot, editor));
const isSblive = (g: Pick<Game, 'contestId'>) => g.contestId.startsWith('sblive:');
/** What a game shows from si.com. */
const sbliveOf = (g: Game) => [g.contestId, g.home.score, g.away.score, g.provenance.backfill ?? null, g.provenance.scoreConflict ?? null];
const shown = (s: Snapshot) => s.games.filter((g) => g.provenance.backfill || g.provenance.scoreConflict).map(sbliveOf);

describe('the si.com claims', () => {
  it.each([
    ['the committed snapshot', committed],
    ['the all corpus’s own output', own],
  ])('seeded from %s, hold the fills and disagreements it shows', (_label, snapshot) => {
    const store = seeded(snapshot);
    const fills = storedFillsOf(store);
    const fromSnapshot = earlierFillsOf(snapshot)!;
    expect(fills.games.length).toBeGreaterThan(0);
    expect(fills.games).toEqual(fromSnapshot.games);
    expect(fills.contests).toEqual(new Map([...fromSnapshot.contests].filter(([id]) => !isSblive({ contestId: id }))));
    expect(storedConflictsOf(store)).toEqual(conflictsFromSnapshot(snapshot));
    expect(storedConflictsOf(store).size).toBeGreaterThan(0);
  });

  it('keep each rule-2 game on a fixture of its own, with the official row it consumed', () => {
    const store = seeded(committed);
    const rule2 = committed.games.filter(isSblive);
    expect(rule2.length).toBeGreaterThan(0);
    for (const g of rule2) {
      const f = store.get(fixtureOfContest(store, g.contestId) as string);
      expect(f?.claims.maxpreps, g.contestId).toBeUndefined();
      expect(f?.claims.sblive?.map((c) => c.fill?.contestId), g.contestId).toEqual([g.contestId]);
      expect(f?.claims.official?.lastMatch, g.contestId).toEqual({ contestId: g.contestId, stamp: g.official });
    }
  });

  it('are rewritten from the publication: a fill not read again keeps its seenAt, a row read is kept on its fill', () => {
    const store = seeded(own);
    const g = own.games.find((x) => x.provenance.backfill?.rule === 'score-pending')!;
    const ref = g.provenance.backfill!.sbliveGameId;
    const claim = () => store.get(store.fixtureOf('sblive', ref) as string)?.claims.sblive?.find((c) => c.ref === ref);
    expect(store.fixtureOf('sblive', ref)).toBe(fixtureOfContest(store, g.contestId));
    writeBackSbliveClaims(store, own.games, { rows: new Map(), sblive: false }, NOW);
    expect(claim()?.seenAt).toBe(own.fetchedAt);
    const row = { sbliveGameId: ref } as never;
    writeBackSbliveClaims(store, own.games, { rows: new Map([[ref, row]]), sblive: true }, NOW);
    expect(claim()).toMatchObject({ seenAt: NOW, row, fill: { rule: 'score-pending', contestId: g.contestId } });
    writeBackSbliveClaims(store, own.games.filter((x) => x !== g), { rows: new Map(), sblive: false }, NOW);
    expect(store.fixtureOf('sblive', ref)).toBeUndefined();
  });
});

describe('the stage’s decisions', () => {
  const games = own.games.filter((g) => !isSblive(g));

  it('a stand-in step’s are read off the games it returned, and resolve to them', () => {
    expect(decisionsFromSbliveStep(games, games)).toEqual({ backfill: new Map(), reconcile: new Map(), created: [] });
    const i = games.findIndex((g, j) => j > 0 && g.status === 'scheduled' && !g.provenance.scoreConflict);
    const g = games[i];
    const filled: Game = {
      ...g,
      home: { ...g.home, score: 2, result: 'W' },
      away: { ...g.away, score: 1, result: 'L' },
      status: 'final',
      decider: 'REG',
      urls: { ...g.urls, sblive: 'https://www.si.com/high-school/stats/california/field-hockey/games/1' },
      provenance: { ...g.provenance, scores: 'sblive', backfill: { rule: 'score-pending', sbliveGameId: '1', maxpreps: null, note: 'n' } },
    };
    const conflicted = { ...games[0], provenance: { ...games[0].provenance, scoreConflict: { sblive: { home: 1, away: 2 }, note: 'x' } } };
    const returned = [conflicted, ...games.slice(1, i), filled, ...games.slice(i + 1), ...own.games.filter(isSblive)];
    const decisions = decisionsFromSbliveStep(games, returned);
    expect([...decisions.backfill.keys()]).toEqual([g.contestId]);
    expect([...decisions.reconcile.keys()]).toEqual([games[0].contestId]);
    expect(decisions.created).toHaveLength(own.games.filter(isSblive).length);
    expect(resolveSbliveStage(games, decisions)).toEqual(returned);
  });

  it('a step that changes a game beyond its si.com value breaks the contract', () => {
    const [g] = games;
    expect(() => decisionsFromSbliveStep([g], [{ ...g, status: 'postponed' }])).toThrow(/beyond its si.com value/);
    expect(() => decisionsFromSbliveStep([g], [])).toThrow(/returned 0 games for 1/);
  });
});

describe('a run that reads no si.com data', () => {
  it('carries the fills and disagreements from a claims file, though the previous snapshot shows none', async () => {
    const claims = claimsFromSnapshot(own, editor) as ClaimsFile;
    const bare: Snapshot = { ...own, games: own.games.filter((g) => !g.provenance.backfill && !g.provenance.scoreConflict) };
    const extraArgs = ['--no-sblive', '--accept-regression', 'scval,bval,pcal,mcal'];
    const fromClaims = await snapshotOf({ steps: STEPS, previous: bare, claims, extraArgs });
    const fromSnapshot = await snapshotOf({ steps: STEPS, previous: own, extraArgs });
    expect(shown(fromSnapshot.snapshot)).toEqual(shown(own));
    expect(shown(fromClaims.snapshot)).toEqual(shown(fromSnapshot.snapshot));
    expect(fromClaims.snapshot.games.filter(isSblive).length).toBeGreaterThan(0);
    expect(fromClaims.snapshot.games.some((g) => g.provenance.backfill?.rule === 'score-pending')).toBe(true);
  });

  it('a file run and a seeded run agree, and the claims the first writes carry the next', async () => {
    const extraArgs = ['--no-sblive'];
    const first = await snapshotOf({ steps: STEPS, extraArgs: [] });
    const written = first.run.result!.claims;
    const previous = loadSnapshot(JSON.parse(JSON.stringify(first.snapshot)) as unknown);
    const fromFile = await snapshotOf({ steps: STEPS, previous, claims: written, extraArgs });
    const fromSeed = await snapshotOf({ steps: STEPS, previous, extraArgs });
    expect(fromFile.snapshot).toEqual(fromSeed.snapshot);
    expect(shown(fromFile.snapshot)).toEqual(shown(first.snapshot));
  });
});

describe('MaxPreps adds the contest a si.com fill stood in for', () => {
  it('the supersede map is the same from a claims file as from the snapshot', async () => {
    const schedule = (slug: string) => readFileSync(path.join(corpusDir('all-2026-10-02'), 'maxpreps', 'schedule', `${slug}.json`), 'utf8');
    const row = JSON.parse(readFileSync(path.join(REPO, 'tests', 'fixtures', 'pipeline', 'santa-catalina-gre-0904-row.json'), 'utf8')) as unknown;
    const cat = JSON.parse(schedule('santa-catalina')) as { data: unknown[] };
    const variant = writeTempVariant({
      'maxpreps/schedule/santa-catalina': { rel: 'santa-catalina.json', body: JSON.stringify({ ...cat, data: [...cat.data, row] }) },
    });
    const first = await snapshotOf({ steps: STEPS });
    const previous = loadSnapshot(JSON.parse(JSON.stringify(first.snapshot)) as unknown);
    const fromFile = await snapshotOf({ steps: STEPS, variants: [variant], previous, claims: first.run.result!.claims });
    const fromSeed = await snapshotOf({ steps: STEPS, variants: [variant], previous });
    expect(fromFile.snapshot.supersededGames['sblive:6541425']).toBeDefined();
    expect(fromFile.snapshot.supersededGames).toEqual(fromSeed.snapshot.supersededGames);
    expect(fromFile.snapshot.games.some((g) => g.contestId === 'sblive:6541425')).toBe(false);
  });
});
