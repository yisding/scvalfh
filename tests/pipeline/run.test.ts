/**
 * The step sequence and its CLI plumbing (SPEC §7.4, §7.11, §7.12) with no-op official/si.com
 * steps: the season-window guard, the bootstrap abort, the request shape of a full corpus run, a
 * deterministic `sources` order however the transport interleaves, `--leagues`, a stale reported
 * table, the corpus `previous` copy, and the two output files. The all-2026-10-02 corpus names four
 * leagues in its manifest: the EAL (added later) is not in its runs and is frozen "not fetched".
 */

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALL_DIVISIONS, DATA_QUALITY, LEAGUES } from '../../lib/leagues';
import { RunAbort, resourcePath, type SnapshotMeta, type Transport } from '../../lib/pipeline/contract';
import { loadCorpus } from '../../lib/pipeline/corpus';
import { SILENT_SINK, emptyRunState } from '../../lib/pipeline/ledger';
import { createPipelineContext, metaPathOf, parseRunArgs, prepareRun, runPipeline, writeOutputs } from '../../lib/pipeline/run';
import { stepStandings } from '../../lib/pipeline/steps/standings';
import { FixtureTransport } from '../../lib/pipeline/transport';
import { ALL_SEASON_ID, SPORT_SEASON_ID } from '../../lib/season';
import { loadSnapshot } from '../../lib/snapshot-schema';
import { stableStringify } from '../../lib/stable-json';
import { FETCHABLE_TEAMS, TEAMS } from '../../lib/teams';
import type { Snapshot } from '../../lib/types';
import { game } from '../game-builder';
import { REPO, corpusDir, variantDir } from '../helpers';
import { NOOP_STEPS } from './support/noop-steps';
import { runCorpus, snapshotOf, writeTempVariant } from './support/run-corpus';

const MISSION = Object.keys(DATA_QUALITY.ignoredMaxprepsLeagueIds)[0];
const opts = { cwd: REPO, now: '2026-10-02T15:00:00.000Z' };
const tmpOut = () => path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-out-')), 'snapshot.json');

function bootstrapHtml(ssid: string): string {
  const data = { query: { ssid, allSeasonId: ALL_SEASON_ID, gendersport: 'girls,fieldhockey' } };
  return `<html><script id="__NEXT_DATA__" crossorigin="anonymous" type="application/json">${JSON.stringify(data)}</script></html>`;
}

describe('parseRunArgs (§7.12 flags)', () => {
  it('parses every flag', () => {
    const a = parseRunArgs(
      [
        '--fixtures', 'tests/fixtures/maxpreps', '--variant', 'v1', '--variant', 'v2', '--out', 'x/s.json', '--dry-run',
        '--fetched-at', '2026-10-02T15:00:00.000Z', '--force', '--leagues', 'bval,scval', '--accept-regression', 'bval',
        '--accept-regression', 'pcal,mcal', '--no-sblive', '--sblive-full', '--no-scval', '--no-ccs', '--no-vnn',
      ],
      opts,
    );
    expect(a).toMatchObject({
      fixtures: path.join(REPO, 'tests/fixtures/maxpreps'),
      variants: [path.join(REPO, 'v1'), path.join(REPO, 'v2')],
      out: path.join(REPO, 'x/s.json'),
      dryRun: true,
      fetchedAt: '2026-10-02T15:00:00.000Z',
      force: true,
      leagues: ['bval', 'scval'],
      acceptRegression: ['bval', 'pcal', 'mcal'],
      sblive: false,
      sbliveFull: true,
      official: false,
      ccs: false,
      vnn: false,
      capture: null,
    });
    expect(parseRunArgs(['--no-official'], opts).official).toBe(false);
  });

  it('defaults: live run stamped now, data/snapshot.json, every source on; offline leaves the stamp to the corpus', () => {
    const live = parseRunArgs([], opts);
    expect(live).toMatchObject({ fixtures: null, fetchedAt: '2026-10-02T15:00:00.000Z', leagues: null, sblive: true, official: true });
    expect(live.out).toBe(path.join(REPO, 'data', 'snapshot.json'));
    expect(parseRunArgs(['--fixtures', 'x'], opts).fetchedAt).toBe('');
  });

  it('refuses unknown flags, unknown leagues and incompatible combinations', () => {
    expect(() => parseRunArgs(['--nope'], opts)).toThrow('unknown flag: --nope');
    expect(() => parseRunArgs(['--leagues', 'scval,ccs'], opts)).toThrow(/unknown league ccs/);
    expect(() => parseRunArgs(['--variant', 'v'], opts)).toThrow(/--variant needs --fixtures/);
    expect(() => parseRunArgs(['--fixtures', 'x', '--capture', 'y'], opts)).toThrow(/cannot be combined/);
    expect(() => parseRunArgs(['--fetched-at', 'yesterday'], opts)).toThrow(/not an ISO timestamp/);
    expect(() => parseRunArgs(['--out'], opts)).toThrow(/needs a value/);
  });
});

describe('step 01: the season window', () => {
  it('outside Aug 1 – Nov 30 it logs "out of season" and returns nothing to write; --force runs anyway', async () => {
    for (const at of ['2026-07-15T20:00:00.000Z', '2026-12-15T20:00:00.000Z']) {
      const run = await runCorpus({ corpus: 'scval', fetchedAt: at });
      expect(run.result, at).toBeNull();
      expect(run.ctx.logLines.join('\n')).toMatch(/out of season: .* is outside Aug 1 – Nov 30 Pacific/);
      expect(run.ctx.logLines.some((l) => l.startsWith('maxpreps GET'))).toBe(false);
    }
    for (const at of ['2026-08-15T20:00:00.000Z', '2026-11-15T20:00:00.000Z']) {
      expect((await runCorpus({ corpus: 'scval', fetchedAt: at })).result, at).not.toBeNull();
    }
    expect((await runCorpus({ corpus: 'scval', fetchedAt: '2026-12-15T20:00:00.000Z', extraArgs: ['--force'] })).result).not.toBeNull();
  });
});

describe('step 02: the bootstrap', () => {
  it('a season id that differs from config is a run abort', async () => {
    const wrong = writeTempVariant({ 'maxpreps/bootstrap': { rel: 'boot.html', body: bootstrapHtml('8ae4cbab-caa1-4889-87a8-547fdaca9516') } });
    await expect(runCorpus({ variants: [wrong] })).rejects.toBeInstanceOf(RunAbort);
    await expect(runCorpus({ variants: [wrong] })).rejects.toThrow(/sportSeasonId changed/);
  });

  it('a matching page is an ok row; an unreadable one only warns; a missing one is skipped', async () => {
    const right = writeTempVariant({ 'maxpreps/bootstrap': { rel: 'boot.html', body: bootstrapHtml(SPORT_SEASON_ID) } });
    const ok = await snapshotOf({ variants: [right] });
    expect(ok.snapshot.sources[0]).toMatchObject({ kind: 'bootstrap', status: 'ok' });
    const broken = writeTempVariant({ 'maxpreps/bootstrap': 500 });
    const err = await snapshotOf({ variants: [broken] });
    expect(err.snapshot.sources[0]).toMatchObject({ kind: 'bootstrap', status: 'error', httpStatus: 500 });
    const missing = await snapshotOf();
    expect(missing.snapshot.sources[0]).toMatchObject({ kind: 'bootstrap', status: 'skipped', error: 'not in corpus' });
  });
});

describe('a full corpus run', () => {
  it('requests the 56 MaxPreps resources in live-shaped order and never the Mission league', async () => {
    const { run } = await snapshotOf();
    const lines = run.result?.logLines ?? [];
    const gets = lines.filter((l) => l.startsWith('maxpreps GET '));
    expect(gets.length).toBe(56);
    expect(gets.some((l) => l.includes(MISSION))).toBe(false);
    const summary = lines.find((l) => l.startsWith('summary: '));
    expect(summary).toMatch(
      /^summary: teams 49 · games \d+ \(league \d+\) · finals \d+ · pending \d+ · backfilled 0 · mismatches \d+ · sources ok \d+\/\d+ · requests maxpreps:56 sblive:0 official:0 · leagues scval:fresh bval:fresh pcal:fresh mcal:fresh eal:frozen$/,
    );
  });

  it('writes one SourceStatus row per resource in the §7.11 order', async () => {
    const { snapshot, run } = await snapshotOf();
    const inRun = run.ctx.leaguesInRun();
    const labels = snapshot.sources.map((s) => s.label);
    const expected = ['season bootstrap'];
    for (const league of LEAGUES.filter((l) => inRun.includes(l.id))) {
      for (const d of league.divisions) expected.push(`${d.id} league metadata`);
      for (const d of league.divisions) expected.push(`${d.id} reported standings`);
      for (const t of FETCHABLE_TEAMS.filter((x) => x.league === league.id)) expected.push(`${t.slug} schedule`);
    }
    // VNN calendars in registry order, then CCS (the corpus has neither: skipped rows).
    expected.push(...TEAMS.filter((t) => t.slug === 'palo-alto' || t.slug === 'los-gatos').map((t) => `${t.slug} school calendar`));
    expected.push('ccs calendar', 'ccs bracket');
    expect(labels).toEqual(expected);
    const teamsInRun = FETCHABLE_TEAMS.filter((t) => inRun.includes(t.league));
    expect(expected.length).toBe(1 + ALL_DIVISIONS.filter((d) => inRun.includes(d.leagueId)).length * 2 + teamsInRun.length + 4);
    expect(snapshot.sources.filter((s) => s.kind === 'team-schedule').map((s) => s.scope?.team)).toEqual(teamsInRun.map((t) => t.slug));
  });

  it('records the dropped contests (Del Norte ghost, excluded 5cf5e3df, the three TBA rows)', async () => {
    const { snapshot } = await snapshotOf();
    expect(snapshot.dropped.map((d) => [d.contestId.slice(0, 8), d.reason])).toEqual([
      ['5cf5e3df', 'excluded-by-config'],
      ['64c8188b', 'tba-opponent'],
      ['55207683', 'tba-opponent'],
      ['64e0b2e5', 'tba-opponent'],
      ['5b9ff911', 'ghost-team'],
    ]);
  });

  it('produces the same sources and snapshot whatever order the transport answers in', async () => {
    const jitter = (seed: number) => (t: Transport): Transport => {
      let s = seed;
      return {
        mode: t.mode,
        get: async (key) => {
          s = (s * 1103515245 + 12345) % 2147483648;
          await new Promise((r) => setTimeout(r, s % 7));
          return t.get(key);
        },
      };
    };
    const a = await snapshotOf({ wrap: jitter(1) });
    const b = await snapshotOf({ wrap: jitter(99) });
    expect(stableStringify(a.snapshot)).toBe(stableStringify(b.snapshot));
  });
});

describe('--leagues', () => {
  it('fetches only the listed leagues (config order) and freezes the others', async () => {
    const { snapshot, run } = await snapshotOf({ extraArgs: ['--leagues', 'mcal,pcal'] });
    expect(run.ctx.leaguesInRun()).toEqual(['pcal', 'mcal']);
    const requested = run.result?.logLines.filter((l) => l.startsWith('maxpreps GET ')).length;
    expect(requested).toBe(1 + 2 + 2 + 7 + 9);
    expect(snapshot.leagueHealth.map((h) => [h.leagueId, h.state])).toEqual([
      ['scval', 'frozen'],
      ['bval', 'frozen'],
      ['pcal', 'fresh'],
      ['mcal', 'fresh'],
      ['eal', 'frozen'],
    ]);
    expect(snapshot.sources.some((s) => s.scope?.league === 'scval' || s.scope?.league === 'bval' || s.scope?.league === 'eal')).toBe(false);
  });

  it('defaults to the corpus manifest’s leagues offline', async () => {
    const { run } = await snapshotOf({ corpus: 'scval' });
    expect(run.ctx.leaguesInRun()).toEqual(['scval']);
    expect(run.result?.logLines.filter((l) => l.startsWith('maxpreps GET ')).length).toBe(1 + 2 + 2 + 15);
  });
});

describe('step 04: an unreadable reported table is a stale source, never an abort', () => {
  it('no previous copy: reportedTable missing, PCAL partial', async () => {
    const { snapshot } = await snapshotOf({ variants: ['pcal-standings-empty'] });
    const pcal = snapshot.leagueHealth.find((h) => h.leagueId === 'pcal');
    expect(pcal?.state).toBe('partial');
    expect(pcal?.divisions[0]).toMatchObject({ reportedTable: 'missing', reportedRows: null });
    expect(pcal?.reasons).toEqual([
      "MaxPreps' PCAL table could not be read this run, and there is no earlier copy to compare against. Scores and our computed table are current.",
    ]);
    expect(snapshot.sources.find((s) => s.label === 'pcal reported standings')).toMatchObject({ status: 'error', error: 'standings returned 0 rows' });
  });

  it('with a previous copy: carried, the row stale with carriedFrom', async () => {
    const previous = (await snapshotOf({ fetchedAt: '2026-09-29T14:02:00.000Z' })).snapshot;
    const { snapshot } = await snapshotOf({ variants: ['pcal-standings-empty'], previous });
    const pcal = snapshot.leagueHealth.find((h) => h.leagueId === 'pcal');
    expect(pcal?.state).toBe('partial');
    expect(pcal?.divisions[0]).toMatchObject({ reportedTable: 'carried', reportedRows: 7 });
    expect(pcal?.reasons).toEqual([
      "MaxPreps' PCAL table could not be read this run; the cross-check uses the copy from Tue Sep 29. Scores and our computed table are current.",
    ]);
    expect(snapshot.sources.find((s) => s.label === 'pcal reported standings')).toMatchObject({
      status: 'stale',
      carriedFrom: '2026-09-29T14:02:00.000Z',
    });
    expect(snapshot.standings.filter((s) => s.division === 'pcal').every((s) => s.reported !== null)).toBe(true);
  });
});

describe('step 12: a division whose league publishes no schedule (EAL)', () => {
  it('has official null and counts its league games past their date with no result as missingLeaguePast', () => {
    const args = parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--out', tmpOut(), '--dry-run'], opts);
    const ctx = createPipelineContext({
      args: { ...args, fetchedAt: '2026-10-02T15:00:00.000Z', leagues: ['eal'] },
      transport: new FixtureTransport(loadCorpus(corpusDir('all-2026-10-02'))),
      previous: null,
      sink: SILENT_SINK,
    });
    const state = emptyRunState();
    state.games = [
      game({ home: 'Chico', away: 'Davis', date: '2026-09-28', hs: 1, as: 1, results: { home: 'W', away: 'L' } }),
      game({ home: 'Corning', away: 'Pleasant Valley', date: '2026-09-29', status: 'score-pending' }),
      game({ home: 'Chico', away: 'Corning', date: '2026-10-01', status: 'scheduled' }),
      game({ home: 'Davis', away: 'Lassen', date: '2026-09-20', status: 'postponed' }),
      game({ home: 'Lassen', away: 'Bella Vista', date: '2026-10-05', status: 'scheduled' }),
      game({ home: 'Lassen', away: 'Chico', date: '2026-09-15', hs: 0, as: 2, league: false }),
    ];
    expect(state.games.map((g) => g.countsFor)).toEqual(['eal', 'eal', 'eal', 'eal', 'eal', null]);
    const { leagueHealth } = stepStandings(ctx, state);
    const eal = leagueHealth.find((h) => h.leagueId === 'eal')!;
    // The two unreported games dated before today; never the postponed one, the future one or a non-league game.
    expect(eal.divisions).toMatchObject([{ divisionId: 'eal', classification: 'contest-type', official: null, countedFinals: 1, missingLeaguePast: 2 }]);
    for (const d of leagueHealth.filter((h) => h.leagueId !== 'eal').flatMap((h) => h.divisions)) {
      expect('missingLeaguePast' in d, d.divisionId).toBe(false);
    }
  });
});

describe('prepareRun and the outputs', () => {
  it('copies a variant’s previous snapshot to --out and starts from it (read in place on a dry run)', () => {
    const out = tmpOut();
    const args = parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--variant', variantDir('finals-regression'), '--out', out], opts);
    const prepared = prepareRun(args, SILENT_SINK);
    const shipped = path.join(variantDir('finals-regression'), 'previous-snapshot.json');
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(shipped, 'utf8'));
    expect(prepared.ctx.previous?.fetchedAt).toBe('2026-10-02T03:00:00.000Z');
    expect(prepared.args.fetchedAt).toBe('2026-10-02T15:00:00.000Z');
    expect(prepared.args.leagues).toEqual(['scval', 'bval', 'pcal', 'mcal']);

    const dryOut = tmpOut();
    const dry = prepareRun({ ...args, out: dryOut, dryRun: true }, SILENT_SINK);
    expect(existsSync(dryOut)).toBe(false);
    expect(dry.previousFile).toBe(shipped);
  });

  it('a dry run records no --capture corpus; a real run does', () => {
    const live = (): Transport => ({ mode: 'live', get: async () => ({ url: '', httpStatus: 200, body: '' }) });
    const capture = path.join(tmpOut(), '..', 'capture');
    const dry = prepareRun(parseRunArgs(['--capture', capture, '--out', tmpOut(), '--dry-run'], opts), SILENT_SINK, live);
    expect(dry.ctx.transport.mode).toBe('live');
    expect(existsSync(capture)).toBe(false);
    const wet = prepareRun(parseRunArgs(['--capture', capture, '--out', tmpOut()], opts), SILENT_SINK, live);
    expect(wet.ctx.transport.mode).toBe('recording');
    expect(existsSync(capture)).toBe(true);
  });

  it('reads a v1 previous snapshot through loadSnapshot (migrated)', () => {
    const args = parseRunArgs(['--fixtures', corpusDir('scval'), '--out', path.join(REPO, 'tests', 'golden', 'snapshot-2026-10-02.v1.json'), '--dry-run'], opts);
    const prepared = prepareRun(args, SILENT_SINK);
    expect(prepared.ctx.previous?.schemaVersion).toBe(2);
    // The v1 file migrates to v2 and gains the leagues it predates (the EAL): every registry team.
    expect(prepared.ctx.previous?.teams.length).toBe(TEAMS.length);
    expect(prepared.ctx.previous?.season.leagues.map((l) => l.id)).toEqual(LEAGUES.map((l) => l.id));
  });

  it('writes stable JSON and the meta file beside it, with per-league rows and the commit summary', async () => {
    const args = parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--out', tmpOut()], opts);
    const prepared = prepareRun(args, SILENT_SINK);
    const result = await runPipeline(prepared.ctx, NOOP_STEPS);
    if (!result) throw new Error('no result');
    const metaPath = writeOutputs(args.out, result);
    expect(metaPath).toBe(metaPathOf(args.out));
    const text = readFileSync(args.out, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    const snapshot: Snapshot = loadSnapshot(JSON.parse(text) as unknown);
    expect(snapshot.schemaVersion).toBe(2);
    expect(text).toBe(stableStringify(snapshot));
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as SnapshotMeta;
    expect(meta.fetchedAt).toBe('2026-10-02T15:00:00.000Z');
    expect(meta.today).toBe('2026-10-02');
    expect(meta.commitSummary).toMatch(/^SCVAL \+\d+ finals · BVAL \+\d+ · PCAL \+\d+ · MCAL \+\d+ · EAL frozen \(not fetched\)$/);
    expect(meta.leagues.map((l) => [l.id, l.state])).toEqual([
      ['scval', 'fresh'],
      ['bval', 'fresh'],
      ['pcal', 'fresh'],
      ['mcal', 'fresh'],
      ['eal', 'frozen'],
    ]);
    expect(meta.requests).toEqual({ maxpreps: 56, sblive: 0, official: 0 });
    expect(typeof meta.contentHash).toBe('string');
  });

  it('never requests a resource of a league outside the run', async () => {
    const seen: string[] = [];
    await runCorpus({
      extraArgs: ['--leagues', 'pcal'],
      wrap: (t) => ({ mode: t.mode, get: async (key) => (seen.push(resourcePath(key)), t.get(key)) }),
    });
    expect(seen.filter((p) => p.startsWith('maxpreps/'))).toEqual([
      'maxpreps/bootstrap',
      'maxpreps/league-meta/pcal',
      'maxpreps/standings/pcal',
      ...FETCHABLE_TEAMS.filter((t) => t.league === 'pcal').map((t) => `maxpreps/schedule/${t.slug}`),
    ]);
  });
});

describe('steps 07-08 never abort the run', () => {
  it('a throwing official step degrades the official-fixtures leagues to contest-type; a throwing si.com step contributes nothing', async () => {
    const { snapshot, run } = await snapshotOf({
      steps: {
        official: async () => {
          throw new Error('boom');
        },
        sblive: async () => {
          throw new Error('bang');
        },
      },
    });
    expect(run.result?.logLines).toContain('WARN official step failed: boom');
    expect(run.result?.logLines).toContain('WARN si.com step failed: bang');
    expect(snapshot.leagueHealth.map((h) => [h.leagueId, h.state])).toEqual([
      ['scval', 'fresh'],
      ['bval', 'degraded'],
      ['pcal', 'degraded'],
      ['mcal', 'degraded'],
      ['eal', 'frozen'],
    ]);
    expect(snapshot.leagueHealth.find((h) => h.leagueId === 'pcal')?.reasons).toEqual([
      "The official PCAL schedule could not be applied this run; league games are identified by MaxPreps' league flag this run.",
    ]);
    expect(run.result?.meta.commitSummary).toMatch(/PCAL degraded \(official schedule not applied\)/);
    expect(snapshot.leagueHealth.find((h) => h.leagueId === 'pcal')?.divisions[0].classification).toBe('fallback-contest-type');
    expect(snapshot.counts.byLeague.pcal.leagueGames).toBeGreaterThan(0);
  });
});
