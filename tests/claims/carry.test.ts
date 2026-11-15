/**
 * Step 06's carry from claims: a feed the run did not read is carried from the MaxPreps
 * claims the previous run wrote, not from the previous snapshot's game list. Over the all-2026-10-02 corpus with the
 * real official and si.com steps:
 *  - a run that reads the claims FILE publishes what a run that seeds its claims from the snapshot publishes;
 *  - a carried claim keeps the stamp of the run that last read it, and the game publishes that stamp;
 *  - a contest a fresh read no longer lists loses its claim; a contest dropped or deleted this run is never carried;
 *  - with no previous snapshot, a claims file left beside --out carries nothing;
 *  - a carried contest publishes as it was last published, folded from its stored claims, and one the previous
 *    publication lacks publishes from its claims.
 */

import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { claimsFileText, claimsPathOf, parseClaimsText } from '../../lib/claims/file';
import type { ClaimsFile } from '../../lib/claims/types';
import { GUID_RE } from '../../lib/game-id';
import type { PipelineSteps } from '../../lib/pipeline/contract';
import { SILENT_SINK } from '../../lib/pipeline/ledger';
import { parseRunArgs, prepareRun, runPipeline } from '../../lib/pipeline/run';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Game, Snapshot } from '../../lib/types';
import { REPO, corpusDir, variantDir } from '../helpers';
import { snapshotOf, writeTempVariant } from '../pipeline/support/run-corpus';

const STEPS: PipelineSteps = { official: stepOfficial, sblive: stepSblive };
const CORPUS = corpusDir('all-2026-10-02');
const FIRST = '2026-10-02T15:00:00.000Z';
const LATER = '2026-10-03T15:00:00.000Z';
/** The contest MaxPreps had for STE@GRE on 9/21 (tests/pipeline/carry.test.ts). */
const STE_GRE_0921 = 'f999e2b1-aa11-4c04-925a-da2c5bd56fff';
const REKEYED = '22222222-3333-4444-8555-666666666666';

const schedule = (slug: string) => readFileSync(path.join(CORPUS, 'maxpreps', 'schedule', `${slug}.json`), 'utf8');
const carriedLine = (lines: readonly string[]) => lines.find((l) => l.startsWith('  carried forward '));

/** A schedule feed with `contestId`'s rows removed, or marked Deleted. */
function withoutContest(slug: string, contestId: string, how: 'gone' | 'deleted'): string {
  const feed = JSON.parse(schedule(slug)) as { data: Array<{ contest: { contestId: string }; calculatedFields: { contestState: number } }> };
  const data = how === 'gone'
    ? feed.data.filter((r) => r.contest.contestId !== contestId)
    : feed.data.map((r) => (r.contest.contestId === contestId ? { ...r, calculatedFields: { ...r.calculatedFields, contestState: 1 } } : r));
  return JSON.stringify({ ...feed, data });
}

/** What the next run reads back: the snapshot and the claims file as written. */
function asWritten(run: { snapshot: Snapshot; claims: ClaimsFile }): { previous: Snapshot; claims: ClaimsFile } {
  return {
    previous: loadSnapshot(JSON.parse(JSON.stringify(run.snapshot)) as unknown),
    claims: parseClaimsText(claimsFileText(run.claims)),
  };
}

const maxprepsRefs = (claims: ClaimsFile) => new Set(claims.fixtures.flatMap((f) => (f.claims.maxpreps ? [f.claims.maxpreps.ref] : [])));

let first: { snapshot: Snapshot; claims: ClaimsFile };
beforeAll(async () => {
  const { snapshot, run } = await snapshotOf({ steps: STEPS });
  first = { snapshot, claims: run.result!.claims };
});

describe('step 06 carries a feed it did not read from the claims file', () => {
  /** A run of SCVAL alone: the other leagues' feeds are not fetched, so their contests are carried. */
  const ONE_LEAGUE = ['--leagues', 'scval'];

  it('publishes what a run seeded from the snapshot publishes', async () => {
    const fromFile = await snapshotOf({ steps: STEPS, extraArgs: ONE_LEAGUE, fetchedAt: LATER, ...asWritten(first) });
    const seeded = await snapshotOf({ steps: STEPS, extraArgs: ONE_LEAGUE, fetchedAt: LATER, previous: asWritten(first).previous });
    expect(carriedLine(fromFile.run.ctx.logLines)).toMatch(/^ {2}carried forward \d+ games from the previous run's claims$/);
    expect(fromFile.snapshot.games).toEqual(seeded.snapshot.games);
    expect(fromFile.snapshot.dropped).toEqual(seeded.snapshot.dropped);
  });

  it('keeps a carried claim’s seenAt, and the carried game publishes it', async () => {
    const { snapshot, run } = await snapshotOf({ steps: STEPS, extraArgs: ONE_LEAGUE, fetchedAt: LATER, ...asWritten(first) });
    const written = parseClaimsText(claimsFileText(run.result!.claims));
    const byId = new Map(snapshot.games.map((g) => [g.contestId, g]));
    const carried = written.fixtures.flatMap((f) => (f.claims.maxpreps?.seenAt === FIRST ? [f.claims.maxpreps] : []));
    expect(carried.length).toBeGreaterThan(0);
    for (const c of carried) {
      expect(c.game.provenance.fetchedAt, c.ref).toBe(FIRST);
      const g = byId.get(c.ref);
      if (g) expect(g.provenance.fetchedAt, c.ref).toBe(FIRST);
    }
    // Every other MaxPreps claim was read this run.
    for (const f of written.fixtures) if (f.claims.maxpreps && f.claims.maxpreps.seenAt !== FIRST) expect(f.claims.maxpreps.seenAt).toBe(LATER);
    // On disk the carried claims keep their older seenAt; the run's own are left to the file's stamp.
    expect(claimsFileText(run.result!.claims)).toContain(`"seenAt": "${FIRST}"`);
  });
});

describe('what is never carried', () => {
  it('a contest both feeds read this run no longer list loses its claim', async () => {
    expect(maxprepsRefs(first.claims).has(STE_GRE_0921)).toBe(true);
    const variant = writeTempVariant({
      'maxpreps/schedule/stevenson': { rel: 'stevenson.json', body: withoutContest('stevenson', STE_GRE_0921, 'gone') },
      'maxpreps/schedule/greenfield': { rel: 'greenfield.json', body: withoutContest('greenfield', STE_GRE_0921, 'gone') },
    });
    const { snapshot, run } = await snapshotOf({ steps: STEPS, variants: [variant], ...asWritten(first) });
    expect(snapshot.games.some((g) => g.contestId === STE_GRE_0921)).toBe(false);
    expect(maxprepsRefs(run.result!.claims).has(STE_GRE_0921)).toBe(false);
  });

  it('a contest the read feed reports Deleted while the other team’s feed fails', async () => {
    const variant = writeTempVariant({
      'maxpreps/schedule/greenfield': 503,
      'maxpreps/schedule/stevenson': { rel: 'stevenson.json', body: withoutContest('stevenson', STE_GRE_0921, 'deleted') },
    });
    const { snapshot, run } = await snapshotOf({ steps: STEPS, variants: [variant], ...asWritten(first) });
    expect(snapshot.games.some((g) => g.contestId === STE_GRE_0921)).toBe(false);
    expect(maxprepsRefs(run.result!.claims).has(STE_GRE_0921)).toBe(false);
  });

  it('a contest the phantom dedupe drops against this run’s re-keyed copy', async () => {
    const variant = writeTempVariant({
      'maxpreps/schedule/greenfield': 503,
      'maxpreps/schedule/stevenson': { rel: 'stevenson.json', body: schedule('stevenson').split(STE_GRE_0921).join(REKEYED) },
    });
    const { snapshot, run } = await snapshotOf({ steps: STEPS, variants: [variant], ...asWritten(first) });
    expect(snapshot.games.some((g) => g.contestId === STE_GRE_0921)).toBe(false);
    expect(snapshot.games.some((g) => g.contestId === REKEYED)).toBe(true);
    expect(snapshot.dropped.some((d) => d.contestId === STE_GRE_0921 && d.reason === 'phantom-duplicate')).toBe(true);
    const refs = maxprepsRefs(run.result!.claims);
    expect(refs.has(STE_GRE_0921)).toBe(false);
    expect(refs.has(REKEYED)).toBe(true);
  });

  it('with no previous snapshot, a claims file left beside --out carries nothing', async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-claims-carry-')), 'snapshot.json');
    writeFileSync(claimsPathOf(out), claimsFileText(first.claims), 'utf8');
    const argv = ['--fixtures', CORPUS, '--variant', variantDir('leland-feed-503'), '--out', out];
    const prepared = prepareRun(parseRunArgs(argv, { cwd: REPO, now: FIRST }), SILENT_SINK);
    expect(prepared.ctx.previous).toBeNull();
    expect(prepared.ctx.claims.ids()).toEqual([]);
    const result = await runPipeline(prepared.ctx, STEPS);
    expect(carriedLine(result!.logLines)).toBeUndefined();
    const plain = await snapshotOf({ steps: STEPS, variants: ['leland-feed-503'] });
    expect(result!.snapshot.games).toEqual(plain.snapshot.games);
  });
});

describe('what a carried contest publishes', () => {
  /** Both teams' feeds fail, so their 9/21 game is carried. */
  const bothFail = () => writeTempVariant({ 'maxpreps/schedule/greenfield': 503, 'maxpreps/schedule/stevenson': 503 });

  it('the game as the previous run published it, with what other sources added and this run did not decide', async () => {
    // A Los Gatos game against a team with a feed: Los Gatos's school calendar is one the run reads, so a confirmed
    // start time is one a run can have published, and claims seeded from that publication hold it.
    const feeds = new Set(readdirSync(path.join(CORPUS, 'maxpreps', 'schedule')).map((f) => f.replace(/\.json$/, '')));
    const game = first.snapshot.games.find(
      (x) => GUID_RE.test(x.contestId) && x.home.slug === 'los-gatos' && x.away.slug !== null && feeds.has(x.away.slug) && !x.timeConfirmed,
    ) as Game;
    expect(game).toBeDefined();
    const written = asWritten(first);
    // A school calendar's confirmation, as a run that read one would have published it; the claims are seeded from it.
    const previous: Snapshot = {
      ...written.previous,
      games: written.previous.games.map((g) => (g.contestId === game.contestId ? { ...g, timeConfirmed: true } : g)),
    };
    const variant = writeTempVariant({ 'maxpreps/schedule/los-gatos': 503, [`maxpreps/schedule/${game.away.slug}`]: 503 });
    const { snapshot, run } = await snapshotOf({ steps: STEPS, variants: [variant], previous });
    expect(carriedLine(run.ctx.logLines)).toBeDefined();
    const g = snapshot.games.find((x) => x.contestId === game.contestId);
    expect(g?.timeConfirmed).toBe(true);
    const was = first.snapshot.games.find((x) => x.contestId === game.contestId) as Game;
    expect({ ...g, timeConfirmed: undefined }).toEqual({ ...was, provenance: { ...was.provenance, contentChangedAt: g?.provenance.contentChangedAt } });
  });

  it('a carried contest the previous publication lacks publishes from its claim', async () => {
    const written = asWritten(first);
    const previous: Snapshot = { ...written.previous, games: written.previous.games.filter((g) => g.contestId !== STE_GRE_0921) };
    const { snapshot, run } = await snapshotOf({ steps: STEPS, variants: [bothFail()], previous, claims: written.claims });
    const g = snapshot.games.find((x) => x.contestId === STE_GRE_0921);
    const was = first.snapshot.games.find((x) => x.contestId === STE_GRE_0921) as Game;
    expect(g, 'carried from its claim').toBeDefined();
    expect([g!.home.score, g!.away.score, g!.status, g!.dateLocal]).toEqual([was.home.score, was.away.score, was.status, was.dateLocal]);
    expect(maxprepsRefs(run.result!.claims).has(STE_GRE_0921)).toBe(true);
  });
});
