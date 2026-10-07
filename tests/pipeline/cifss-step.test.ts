/**
 * Step 11b, lib/pipeline/steps/cifss.ts: every Section read in full → a fresh report; anything less
 * → the previous report carried (rows still true only) and a failed Section's row marked stale; a
 * contest MaxPreps reported Deleted this run is never listed as missing from MaxPreps.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TransportError, type RawResponse, type ResourceKey, type Transport } from '../../lib/pipeline/contract';
import { SILENT_SINK, emptyRunState } from '../../lib/pipeline/ledger';
import { createPipelineContext, parseRunArgs } from '../../lib/pipeline/run';
import { stepCifss } from '../../lib/pipeline/steps/cifss';
import { resourceUrl } from '../../lib/pipeline/transport';
import { CIFSS_SECTIONS } from '../../lib/sources/cifss';
import type { ScheduleRow } from '../../lib/sources/maxpreps';
import { resolveTeam } from '../../lib/teams';
import type { CifssCrossCheck, Game, Snapshot } from '../../lib/types';
import { REPO, game } from '../helpers';

const EMPTY = '<html><body><table class="table"><tr class="text-left"><th>Sport</th></tr></table></body></html>';
const page = (name: string) => readFileSync(path.join(REPO, 'tests/fixtures/cifss', name), 'utf8');

/** Serves ccs-1.html for every CCS page and ncs-1.html for NCS page 1, an empty listing elsewhere. */
class FakeTransport implements Transport {
  readonly mode = 'fixture' as const;
  readonly requested: string[] = [];
  constructor(private readonly failing: Set<string> = new Set()) {}
  async get(key: ResourceKey): Promise<RawResponse> {
    if (key.kind !== 'cifss-scores') throw new Error(`unexpected ${key.kind}`);
    const url = resourceUrl(key);
    this.requested.push(`${key.section}/${key.page}`);
    if (this.failing.has(key.section)) throw new TransportError('HTTP 503', url, 503);
    const body = key.section === 'ccs' ? page('ccs-1.html') : key.section === 'ncs' ? page('ncs-1.html') : EMPTY;
    return { url, httpStatus: 200, body };
  }
}

function contextOf(transport: Transport, previous: Snapshot | null = null) {
  const args = { ...parseRunArgs([], { cwd: REPO, now: '2026-10-07T15:00:00.000Z' }), fetchedAt: '2026-10-07T15:00:00.000Z' };
  return createPipelineContext({ args, transport, previous, sink: SILENT_SINK });
}

/** A MaxPreps schedule row in state 1 (Deleted), as much of one as the step reads. */
function deletedRow(date: string, a: string, b: string): ScheduleRow {
  const team = (name: string) => ({ teamId: resolveTeam(name)?.id ?? null, name });
  return { contest: { date, teams: [team(a), team(b)] }, calculatedFields: { contestState: 1 } } as unknown as ScheduleRow;
}

const GAMES: Game[] = [
  game({ home: 'Homestead', away: 'Santa Clara', hs: 4, as: 0, date: '2026-08-24', league: false }),
  game({ home: 'Los Altos', away: 'Leigh', hs: 1, as: 3, date: '2026-08-28', league: false }),
  game({ home: 'Tamalpais', away: 'Convent of the Sacred Heart', hs: 2, as: 0, date: '2026-08-26' }),
];

describe('stepCifss', () => {
  it('reads every page of every Section and compares, leaving a Deleted contest out', async () => {
    const transport = new FakeTransport();
    const ctx = contextOf(transport);
    const state = emptyRunState();
    state.games = GAMES;
    state.rows = [deletedRow('2026-08-25T16:00:00', 'Valley Christian', 'Christopher')];
    const report = await stepCifss(ctx, state);

    // CCS lists six pages (the fixture's pagination); every other Section one.
    expect(transport.requested.filter((r) => r.startsWith('ccs/'))).toEqual(['ccs/1', 'ccs/2', 'ccs/3', 'ccs/4', 'ccs/5', 'ccs/6']);
    expect(transport.requested).toHaveLength(6 + CIFSS_SECTIONS.length - 1);
    // Homestead and Tamalpais agree; Los Altos–Leigh is 1-2 on the widget, 1-3 on MaxPreps (each CCS
    // page repeats the same rows, so this checks the merge too); VC–Christopher is Deleted on MaxPreps.
    expect(report).toMatchObject({ compared: 3, agreements: 2, cifssOnlyScored: [], notOnMaxPreps: [], cifssFetchedAt: '2026-10-07T15:00:00.000Z' });
    expect(report?.conflicts.map((c) => c.label)).toEqual(['Leigh at Los Altos']);
    const rows = ctx.sources.ordered().filter((r) => r.id === 'cifss');
    expect(rows.map((r) => [r.status, r.rowCount])).toEqual([
      ['ok', 24],
      ['ok', 2],
      ['ok', 0],
      ['ok', 0],
      ['ok', 0],
      ['ok', 0],
    ]);
  });

  it('lists VC–Christopher as missing from MaxPreps when no Deleted contest explains it', async () => {
    const state = emptyRunState();
    state.games = GAMES;
    const report = await stepCifss(contextOf(new FakeTransport()), state);
    expect(report?.notOnMaxPreps.map((r) => r.label)).toEqual(['Christopher at Valley Christian']);
  });

  it('carries the previous report, true rows only, when a Section fails, and marks its row stale', async () => {
    const state = emptyRunState();
    state.games = GAMES;
    const prior = (await stepCifss(contextOf(new FakeTransport()), state)) as CifssCrossCheck;
    const previous = { fetchedAt: '2026-10-06T15:00:00.000Z', sources: [], cifssCrossCheck: prior } as unknown as Snapshot;

    // MaxPreps now has Los Altos–Leigh at 1-2, so its conflict row is no longer true.
    const fixed = GAMES.map((g) => (g.home.slug === 'los-altos' ? { ...g, away: { ...g.away, score: 2 } } : g));
    const next = emptyRunState();
    next.games = fixed;
    const ctx = contextOf(new FakeTransport(new Set(['sds'])), previous);
    const carried = await stepCifss(ctx, next);
    expect(carried).toMatchObject({ cifssFetchedAt: prior.cifssFetchedAt, compared: prior.compared, conflicts: [] });
    expect(carried?.notOnMaxPreps).toEqual(prior.notOnMaxPreps);
    const sds = ctx.sources.ordered().find((r) => r.id === 'cifss' && r.label.includes('San Diego'));
    expect(sds).toMatchObject({ status: 'stale', httpStatus: 503 });
  });

  it('reads nothing with --no-cifss, and carries nothing when there is nothing to carry', async () => {
    const transport = new FakeTransport();
    const ctx = createPipelineContext({
      args: { ...parseRunArgs(['--no-cifss'], { cwd: REPO, now: '2026-10-07T15:00:00.000Z' }) },
      transport,
      previous: null,
      sink: SILENT_SINK,
    });
    expect(await stepCifss(ctx, emptyRunState())).toBeUndefined();
    expect(transport.requested).toEqual([]);
  });
});
