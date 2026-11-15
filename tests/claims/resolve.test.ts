/**
 * The pure-resolve property (docs/DATA-SOURCES.md §4.2): the claims file a run wrote, read back as any later run
 * reads it, plus the run's decisions and view order (lib/claims/view.ts), resolve (lib/claims/resolve.ts resolveView)
 * to exactly the games the run's snapshot published, before assembly gave them their URLs and content dates. So the
 * published games are a function of the stored claims and the decisions alone: no stage keeps a game the claims and
 * the decisions do not account for.
 *
 * Runs with the real official and si.com steps over the corpora fresh, with a previous run (claims read from its
 * file, and seeded from its snapshot), with a feed down (contests carried), with a league frozen from the previous
 * snapshot, on a day the editor's listings are published, and on a playoff day reading the San Diego bracket sheet.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { claimsFileText, parseClaimsText } from '../../lib/claims/file';
import { resolveFixture, resolveView } from '../../lib/claims/resolve';
import { ClaimStore } from '../../lib/claims/store';
import type { ClaimsFile } from '../../lib/claims/types';
import { byDateThenId } from '../../lib/format';
import type { PipelineSteps } from '../../lib/pipeline/contract';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Game, Snapshot } from '../../lib/types';
import { REPO, type CorpusName } from '../helpers';
import { snapshotOf, writeTempVariant, type RunCorpusOptions } from '../pipeline/support/run-corpus';

const STEPS: PipelineSteps = { official: stepOfficial, sblive: stepSblive };
const PLAYOFF_DAY = '2026-11-07T15:00:00.000Z';

/** A published game without what assembly adds (lib/pipeline/steps/assemble.ts: slug, aliases, provenance.contentChangedAt). */
function unassembled(g: Game): Game {
  const { slug: _slug, aliases: _aliases, ...rest } = g;
  const { contentChangedAt: _changed, ...provenance } = g.provenance;
  void [_slug, _aliases, _changed];
  return JSON.parse(JSON.stringify({ ...rest, provenance })) as Game;
}

/** Runs `opts`, then resolves the claims file it wrote with its decisions and checks the snapshot's games. */
async function expectPureResolve(label: string, opts: RunCorpusOptions): Promise<{ snapshot: Snapshot; claims: ClaimsFile }> {
  const { snapshot, run } = await snapshotOf({ steps: STEPS, ...opts });
  const claims = run.result!.claims;
  const store = ClaimStore.fromFile(parseClaimsText(claimsFileText(claims)));
  const view = run.ctx.view;
  const resolved = resolveView(view.ids(), store, view.decisions(), view.runFacts(), run.ctx.editor, 'results');
  expect(resolved.length, `${label}: one game per fixture of the view`).toBe(snapshot.games.length);
  expect([...resolved].sort(byDateThenId).map(unassembled), label).toEqual(snapshot.games.map(unassembled));
  return { snapshot, claims };
}

/** What a later run reads back: the snapshot and the claims file as written. */
function asWritten(run: { snapshot: Snapshot; claims: ClaimsFile }): { previous: Snapshot; claims: ClaimsFile } {
  return {
    previous: loadSnapshot(JSON.parse(JSON.stringify(run.snapshot)) as unknown),
    claims: parseClaimsText(claimsFileText(run.claims)),
  };
}

describe('resolving the written claims file with the run’s decisions gives the snapshot’s games', () => {
  it.each<CorpusName>(['all-2026-10-02', 'eal-2026-10-04', 'socal-2026-10-06'])('%s, fresh and after a run of its own', async (corpus) => {
    const first = await expectPureResolve(`${corpus} fresh`, { corpus });
    await expectPureResolve(`${corpus} from file`, { corpus, ...asWritten(first) });
    await expectPureResolve(`${corpus} seeded`, { corpus, previous: asWritten(first).previous });
  });

  it('a feed down: its contests carried as last published', async () => {
    const first = await expectPureResolve('fresh', {});
    await expectPureResolve('leland-feed-503 from file', { variants: ['leland-feed-503'], ...asWritten(first) });
    await expectPureResolve('--leagues scval from file', { extraArgs: ['--leagues', 'scval'], ...asWritten(first) });
  });

  it('a league frozen from the previous snapshot: its games as last published', async () => {
    const first = await expectPureResolve('fresh', {});
    const { snapshot } = await expectPureResolve('bval frozen', { variants: ['bval-meta-wrong-season'], ...asWritten(first) });
    expect(snapshot.leagueHealth.find((h) => h.leagueId === 'bval')?.state).toBe('frozen');
  });

  it('on a day the editor’s listings are published', async () => {
    const { snapshot } = await expectPureResolve('listings', { fetchedAt: PLAYOFF_DAY });
    expect(snapshot.games.some((g) => g.contestId.startsWith('official:'))).toBe(true);
  });

  it('on a playoff day reading the San Diego bracket sheet, and again from the committed snapshot and claims file', async () => {
    const tab = (division: string) => ({
      rel: `${division}.csv`,
      body: readFileSync(path.join(REPO, 'tests', 'fixtures', 'sds', 'sheet-2026', `${division}.csv`), 'utf8'),
    });
    const variant = writeTempVariant({
      'sds/bracket-sheet/open': tab('open'),
      'sds/bracket-sheet/division-1': tab('division-1'),
      'sds/bracket-sheet/division-2': tab('division-2'),
    });
    const socal = { corpus: 'socal-2026-10-06' as CorpusName, fetchedAt: PLAYOFF_DAY, variants: [variant] };
    const { snapshot } = await expectPureResolve('sheet read', socal);
    expect(snapshot.games.some((g) => g.contestId.startsWith('cifsds:'))).toBe(true);
    const previous = loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data', 'snapshot.json'), 'utf8')) as unknown);
    const claims = parseClaimsText(readFileSync(path.join(REPO, 'data', 'claims.json'), 'utf8'));
    await expectPureResolve('committed', { ...socal, previous, claims, extraArgs: ['--accept-regression', 'scval,bval,pcal,mcal,eal,sunset,city,north-county,metro,independents'] });
  });

  it('resolveFixture folds a fixture through the stages it is in, and none before', async () => {
    const { run } = await snapshotOf({ steps: STEPS, fetchedAt: PLAYOFF_DAY });
    const view = run.ctx.view;
    const listed = view.ids().find((id) => view.decisions().get(id)?.from === 'results');
    expect(listed).toBeDefined();
    const f = run.ctx.claims.get(listed!) ?? { id: listed!, claims: {} };
    const d = view.decisions().get(listed!)!;
    expect(resolveFixture(f, d, view.runFacts(), run.ctx.editor, 'guards')).toBeNull();
    expect(resolveFixture(f, d, view.runFacts(), run.ctx.editor, 'results')?.contestId).toBe(d.enters?.contestId);
  });
});
