/**
 * The league schedules' claims (pipeline inversion P5, §7.2): seeded from a snapshot and rewritten from each run's
 * publication, one claim per official row, with the contest and stamp it last published (`lastMatch`) or, for a
 * row no game matched, on an official-only fixture. A division the run does not read is carried from them exactly
 * as it was carried from the previous snapshot, and the stage's games are the step's decisions applied to its
 * input, whether the step recorded them (the real one) or they are read off the games it returned (a stand-in).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ledgerEditor } from '../../lib/claims/editor';
import { claimsFromSnapshot } from '../../lib/claims/from-snapshot';
import { fixtureOfContest } from '../../lib/claims/published';
import { carryOfficialFromClaims, decisionsFromOfficialStep, storedOfficialFromSnapshot, storedOfficialOf, writeBackOfficialClaims } from '../../lib/claims/sources/official';
import { ClaimStore } from '../../lib/claims/store';
import { ALL_DIVISIONS } from '../../lib/leagues';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import { carryOfficialForward } from '../../lib/sources/scval-pdf';
import type { Game, Snapshot } from '../../lib/types';
import { REPO, corpusSnapshotPath } from '../helpers';
import { naiveBvalOfficial } from '../pipeline/support/noop-steps';
import { snapshotOf } from '../pipeline/support/run-corpus';
import { resolveOfficialStage } from '../support/list-steps';

const committed = loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data', 'snapshot.json'), 'utf8')) as unknown);
const own = loadSnapshot(JSON.parse(readFileSync(corpusSnapshotPath('all-2026-10-02'), 'utf8')) as unknown);
const editor = ledgerEditor(committed.fetchedAt).view;
const NOW = '2026-11-16T15:00:00.000Z';
const seeded = (snapshot: Snapshot) => ClaimStore.fromFile(claimsFromSnapshot(snapshot, editor));
/** The stage's input as the carry sees it: every game with its stamp cleared. An si.com rule-2 game is added only by a later stage. */
const unstamped = (games: readonly Game[]): Game[] =>
  games.filter((g) => !g.contestId.startsWith('sblive:')).map(({ official: _o, ...g }) => (void _o, g));

describe('the official claims', () => {
  it.each([
    ['the committed snapshot', committed],
    ['the all corpus’s own output', own],
  ])('seeded from %s, hold the stamps and unmatched rows it shows', (_label, snapshot) => {
    const stored = storedOfficialOf(seeded(snapshot));
    const shown = storedOfficialFromSnapshot(snapshot);
    expect(stored.stamps.size).toBeGreaterThan(0);
    expect(stored).toEqual(shown);
    for (const g of snapshot.games.filter((x) => x.official && !x.contestId.startsWith('sblive:'))) {
      const f = seeded(snapshot).get(fixtureOfContest(seeded(snapshot), g.contestId) as string);
      expect(f?.claims.official?.lastMatch, g.contestId).toEqual({ contestId: g.contestId, stamp: g.official });
    }
  });

  it('a division carried from the claims is the division carried from the snapshot: stamps with no notes, its unmatched rows', () => {
    const stored = storedOfficialOf(seeded(own));
    const games = unstamped(own.games);
    let carried = 0;
    for (const d of ALL_DIVISIONS) {
      const fromClaims = carryOfficialFromClaims([d.id], stored, games);
      const fromSnapshot = carryOfficialForward([d.id], own, games);
      expect(fromClaims.games, d.id).toEqual(fromSnapshot.games);
      expect(fromClaims.fixtures, d.id).toEqual(fromSnapshot.fixtures);
      expect(fromClaims.carried, d.id).toBe(fromSnapshot.carried);
      expect(fromClaims.stamped).toHaveLength(fromSnapshot.carried);
      carried += fromClaims.carried;
    }
    expect(carried).toBeGreaterThan(0);
  });

  it('is rewritten from the publication: a row read is kept whole, an unread division’s claim keeps its seenAt', () => {
    const store = seeded(own);
    const g = own.games.find((x) => x.official)!;
    const id = fixtureOfContest(store, g.contestId) as string;
    expect(store.get(id)?.claims.official).toMatchObject({ seenAt: own.fetchedAt, stamp: g.official });
    writeBackOfficialClaims(store, own.games, own.officialFixtures ?? [], { rows: [], divisions: new Set() }, NOW);
    expect(store.get(id)?.claims.official?.seenAt).toBe(own.fetchedAt);
    const row = { id: g.official!.fixtureId } as never;
    writeBackOfficialClaims(store, own.games, own.officialFixtures ?? [], { rows: [row], divisions: new Set([g.official!.division]) }, NOW);
    expect(store.get(id)?.claims.official).toMatchObject({ seenAt: NOW, fixture: row, lastMatch: { contestId: g.contestId } });
    expect(store.get(id)?.claims.official).not.toHaveProperty('stamp');
    // Not read again: the row it holds stays.
    writeBackOfficialClaims(store, own.games, own.officialFixtures ?? [], { rows: [], divisions: new Set() }, '2026-11-17T15:00:00.000Z');
    expect(store.get(id)?.claims.official).toMatchObject({ seenAt: NOW, fixture: row });
  });
});

describe('the stage’s decisions', () => {
  it('a stand-in step’s are read off the games it returned, and resolve to them', async () => {
    const before = own.games.map((g) => ({ ...g, official: undefined, countsFor: null }) as Game);
    const after = (await naiveBvalOfficial(null as never, before)).games;
    const decisions = decisionsFromOfficialStep(before, after);
    expect(decisions.size).toBeGreaterThan(0);
    expect(resolveOfficialStage(before, decisions)).toEqual(after);
  });

  it('a step that changes a game beyond its stamp and notes breaks the contract', () => {
    const [g] = own.games;
    expect(() => decisionsFromOfficialStep([g], [{ ...g, status: 'postponed' }])).toThrow(/beyond its official stamp and notes/);
    expect(() => decisionsFromOfficialStep([g], [])).toThrow(/returned 0 games for 1/);
  });

  it('the real step records its own, carried stamps included, and they resolve to the games it returned', async () => {
    vi.stubEnv('SCVAL_STAGE_TRACE', '1');
    try {
      const { run } = await snapshotOf({ steps: { official: stepOfficial, sblive: stepSblive }, previous: own, extraArgs: ['--no-official'] });
      expect(run.result?.logLines.some((l) => /official de-anza: carried forward/.test(l))).toBe(true);
      const stage = run.ctx.trace?.find((r) => r.stage === 'official' && r.kind === 'resolve');
      expect(stage && 'stepGames' in stage ? stage.games : null).toEqual(stage && 'stepGames' in stage ? stage.stepGames : undefined);
      expect(run.ctx.trace?.filter((r) => r.stage === 'official' && r.kind === 'carry').map((r) => 'division' in r && r.division)).toEqual(['de-anza', 'el-camino']);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('a run with --no-official', () => {
  it('carries the live divisions from the claims, though the previous snapshot shows no stamp and no unmatched row', async () => {
    const claims = claimsFromSnapshot(own, editor);
    const bare: Snapshot = { ...own, games: unstamped(own.games), officialFixtures: [] };
    const steps = { official: stepOfficial, sblive: stepSblive };
    const fromClaims = await snapshotOf({ steps, previous: bare, claims, extraArgs: ['--no-official'] });
    const fromSnapshot = await snapshotOf({ steps, previous: own, extraArgs: ['--no-official'] });
    const scval = (s: Snapshot) => s.games.filter((g) => g.official?.source === 'scval-pdf').map((g) => [g.contestId, g.official]);
    expect(scval(fromClaims.snapshot).length).toBeGreaterThan(0);
    expect(scval(fromClaims.snapshot)).toEqual(scval(fromSnapshot.snapshot));
    expect(fromClaims.snapshot.officialFixtures).toEqual(fromSnapshot.snapshot.officialFixtures);
    const carried = (s: Snapshot) => s.leagueHealth.flatMap((h) => h.divisions.filter((d) => d.official?.carried).map((d) => d.divisionId));
    expect(carried(fromClaims.snapshot)).toEqual(['de-anza', 'el-camino']);
  });
});
