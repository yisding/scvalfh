/**
 * Carry-forward never double-counts and never silently drops (SPEC §7.5, §7.6, §7.9 rule 10): runs the
 * real pipeline (real official and si.com steps) over the all-2026-10-02 corpus with that corpus's own
 * output as the previous snapshot, and one upstream change per case:
 *  - a failed team feed while MaxPreps re-keys or adds a contest the previous run had (step 06 carry);
 *  - si.com pages failing, or si.com not read at all, after an earlier run filled PCAL scores (rule 10);
 *  - si.com fully down while MaxPreps corrected a game the previous report listed as a conflict.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot, parseSnapshot } from '../../lib/snapshot-schema';
import type { PipelineSteps } from '../../lib/pipeline/contract';
import type { Snapshot } from '../../lib/types';
import { REPO, corpusDir, corpusSnapshotPath } from '../helpers';
import { snapshotOf, writeTempVariant } from './support/run-corpus';

const STEPS: PipelineSteps = { official: stepOfficial, sblive: stepSblive };
const CORPUS = corpusDir('all-2026-10-02');
const schedule = (slug: string) => readFileSync(path.join(CORPUS, 'maxpreps', 'schedule', `${slug}.json`), 'utf8');

/** The contest MaxPreps had for STE@GRE on 9/21, and the si.com fill for the 9/4 GRE@CAT fixture. */
const STE_GRE_0921 = 'f999e2b1-aa11-4c04-925a-da2c5bd56fff';
const REKEYED = '22222222-3333-4444-8555-666666666666';
const GRE_CAT_FILL = 'sblive:6541425';
const GRE_CAT_CONTEST = '11111111-2222-4333-8444-555555555555';

let previous: Snapshot;
beforeAll(() => {
  previous = loadSnapshot(JSON.parse(readFileSync(corpusSnapshotPath('all-2026-10-02'), 'utf8')) as unknown);
});

function pcalTable(s: Snapshot): string[] {
  return s.standings
    .filter((r) => r.division === 'pcal')
    .sort((a, b) => a.computed.place - b.computed.place || a.slug.localeCompare(b.slug))
    .map((r) => `${r.slug} ${r.computed.place}${r.tiebreak.shared ? '=' : ''} gp${r.computed.gp} ${r.computed.pts}`);
}

/** No official fixture is counted twice. */
function doubleCounted(s: Snapshot): string[] {
  const seen = new Map<string, number>();
  for (const g of s.games) {
    if (g.countsFor === null || !g.official) continue;
    seen.set(g.official.fixtureId, (seen.get(g.official.fixtureId) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
}

/** tests/snapshot-file.test.ts's cross-check invariants (the cron's test gate). */
function expectCrossCheckConsistent(s: Snapshot): void {
  const x = s.sbliveCrossCheck;
  if (!x) return;
  expect(x.compared).toBeGreaterThanOrEqual(x.agreements + x.conflicts.length);
  for (const row of x.conflicts) {
    const game = s.games.find((g) => g.contestId === row.contestId);
    expect(game, row.contestId).toBeDefined();
    expect(game?.home.score, row.contestId).toBe(row.maxpreps.home);
    expect(game?.away.score, row.contestId).toBe(row.maxpreps.away);
    expect(game?.provenance.scores).not.toBe('sblive');
  }
  for (const row of x.backfilled) {
    const game = s.games.find((g) => g.contestId === row.contestId);
    expect(game?.provenance.scores, row.contestId).toBe('sblive');
    expect({ home: game?.home.score, away: game?.away.score }).toEqual(row.sblive);
  }
}

describe('step 06: a failed feed’s carried games are decided again, never counted twice', () => {
  it('MaxPreps re-keys a contest while the other team’s feed fails: the carried copy is dropped as a phantom', async () => {
    const variant = writeTempVariant({
      'maxpreps/schedule/greenfield': 503,
      'maxpreps/schedule/stevenson': { rel: 'stevenson.json', body: schedule('stevenson').split(STE_GRE_0921).join(REKEYED) },
    });
    const { snapshot } = await snapshotOf({ variants: [variant], previous, steps: STEPS });
    expect(doubleCounted(snapshot)).toEqual([]);
    expect(snapshot.games.some((g) => g.contestId === STE_GRE_0921)).toBe(false);
    expect(snapshot.games.find((g) => g.contestId === REKEYED)?.countsFor).toBe('pcal');
    expect(snapshot.dropped.find((d) => d.contestId === STE_GRE_0921)?.reason).toBe('phantom-duplicate');
    expect(pcalTable(snapshot)).toEqual(pcalTable(previous));
    expect(() => parseSnapshot(snapshot)).not.toThrow();
  });

  it('MaxPreps adds the contest a si.com fill stood in for while a feed fails: the fill is not carried', async () => {
    const row = JSON.parse(readFileSync(path.join(REPO, 'tests', 'fixtures', 'pipeline', 'santa-catalina-gre-0904-row.json'), 'utf8')) as unknown;
    const cat = JSON.parse(schedule('santa-catalina')) as { data: unknown[] };
    const variant = writeTempVariant({
      'maxpreps/schedule/greenfield': 503,
      'maxpreps/schedule/santa-catalina': { rel: 'santa-catalina.json', body: JSON.stringify({ ...cat, data: [...cat.data, row] }) },
    });
    const { snapshot } = await snapshotOf({ variants: [variant], previous, steps: STEPS });
    expect(previous.games.some((g) => g.contestId === GRE_CAT_FILL)).toBe(true);
    expect(snapshot.games.some((g) => g.contestId === GRE_CAT_FILL)).toBe(false);
    expect(snapshot.games.find((g) => g.contestId === GRE_CAT_CONTEST)?.official?.fixtureId).toBe('pcal:2026-09-04:greenfield@santa-catalina');
    expect(snapshot.supersededGames[GRE_CAT_FILL]).toBe(GRE_CAT_CONTEST);
    expect(doubleCounted(snapshot)).toEqual([]);
    // The Oct 6 fixture of the same pair is still to be played: nothing old was matched to it.
    expect(snapshot.games.filter((g) => g.official?.fixtureId === 'pcal:2026-10-06:santa-catalina@greenfield' && g.status === 'final')).toEqual([]);
    expect(pcalTable(snapshot)).toEqual(pcalTable(previous));
  });
});

describe('rule 10: an earlier si.com fill survives a run that did not read it', () => {
  it('the PCAL si.com team pages fail (scoreboards fine): the fills are carried, PCAL stays fresh', async () => {
    const pages = ['carmel', 'greenfield', 'hollister', 'salinas', 'santa-catalina', 'stevenson'];
    const variant = writeTempVariant(Object.fromEntries(pages.map((p) => [`sblive/team-games/${p}`, 503])));
    const { snapshot } = await snapshotOf({ variants: [variant], previous, steps: STEPS });
    expect(pcalTable(snapshot)).toEqual(pcalTable(previous));
    expect(snapshot.leagueHealth.find((h) => h.leagueId === 'pcal')?.state).toBe('fresh');
    expect(snapshot.sbliveCrossCheck?.backfilled.map((r) => r.contestId).sort()).toEqual(
      previous.sbliveCrossCheck?.backfilled.map((r) => r.contestId).sort(),
    );
    const failed = snapshot.sources.filter((r) => r.kind === 'sblive-team-games' && pages.includes(r.scope?.team ?? ''));
    expect(failed.length).toBeGreaterThan(0);
    for (const r of failed) expect(r.status, r.label).toBe('stale');
    expectCrossCheckConsistent(snapshot);
  });

  it('--no-sblive after a run with fills: PCAL is not frozen, and the carried fills are listed', async () => {
    const { snapshot } = await snapshotOf({ previous, steps: STEPS, extraArgs: ['--no-sblive'] });
    expect(snapshot.leagueHealth.find((h) => h.leagueId === 'pcal')?.state).toBe('fresh');
    expect(pcalTable(snapshot)).toEqual(pcalTable(previous));
    expect(snapshot.sbliveCrossCheck?.backfilled).toHaveLength(previous.sbliveCrossCheck?.backfilled.length ?? -1);
    expect(snapshot.games.filter((g) => g.provenance.scores === 'sblive')).toHaveLength(snapshot.sbliveCrossCheck?.backfilled.length ?? -1);
    expectCrossCheckConsistent(snapshot);
  });
});

describe('si.com fully down: the carried report never contradicts the games', () => {
  it('drops a previous conflict row whose MaxPreps score has changed since', async () => {
    const conflict = previous.sbliveCrossCheck?.conflicts[0];
    expect(conflict, 'the corpus has a conflict row').toBeDefined();
    if (!conflict) return;
    // The previous run saw MaxPreps at 9-0; MaxPreps now says 8-0 (a correction since).
    const stale: Snapshot = {
      ...previous,
      sbliveCrossCheck: {
        ...previous.sbliveCrossCheck!,
        conflicts: [{ ...conflict, maxpreps: { ...conflict.maxpreps, away: conflict.maxpreps.away + 1 } }],
      },
    };
    const sbliveKeys = Object.keys((JSON.parse(readFileSync(path.join(CORPUS, 'manifest.json'), 'utf8')) as { files: Record<string, string> }).files)
      .filter((k) => k.startsWith('sblive/'));
    const variant = writeTempVariant(Object.fromEntries(sbliveKeys.map((k) => [k, 503])));
    const { snapshot } = await snapshotOf({ variants: [variant], previous: stale, steps: STEPS });
    expect(snapshot.sbliveCrossCheck?.conflicts.find((r) => r.contestId === conflict.contestId)).toBeUndefined();
    expect(snapshot.sbliveCrossCheck?.sbliveFetchedAt).toBe(previous.sbliveCrossCheck?.sbliveFetchedAt);
    expectCrossCheckConsistent(snapshot);
    expect(pcalTable(snapshot)).toEqual(pcalTable(previous));

    // With the previous report as it was, the row is still true and is carried.
    const { snapshot: same } = await snapshotOf({ variants: [variant], previous, steps: STEPS });
    expect(same.sbliveCrossCheck?.conflicts.map((r) => r.contestId)).toEqual([conflict.contestId]);
    expectCrossCheckConsistent(same);
  });
});
