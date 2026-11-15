/**
 * The hidden-default detector (pipeline inversion §3 decision 5, P7): the pipeline reads the fixture ledger only as
 * the editor's claims (lib/claims/editor.ts), and passes their slices to every rule it calls. A run whose editor
 * reads an EMPTY ledger must therefore publish none of the real ledger's facts: no corrected day, host or result,
 * no listed game, no rejected or duplicate row dropped, and none of the ledger's citation sentences anywhere in the
 * snapshot. A rule left to its LEDGER_VIEW default would still apply the real ledger and fail here, which the
 * import-level boundary (tests/claims/boundary.test.ts) cannot see.
 *
 * Each case also runs with the real ledger, to show the corpus exercises the facts it checks for.
 */

import { describe, expect, it } from 'vitest';

import { EMPTY_LEDGER, LEDGER, LEDGER_VIEW } from '../../lib/fixtures/ledger';
import type { PipelineSteps } from '../../lib/pipeline/contract';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import type { Snapshot } from '../../lib/types';
import { type CorpusName } from '../helpers';
import { snapshotOf } from '../pipeline/support/run-corpus';

const STEPS: PipelineSteps = { official: stepOfficial, sblive: stepSblive };
/** A day the corpora's ledger facts are all due: the editor's listings are published from their day on. */
const LATE = '2026-11-07T15:00:00.000Z';

/**
 * Every citation sentence the ledger holds. Not its pages: a result cited from MaxPreps' own game page has the same
 * URL as the game's MaxPreps link.
 */
function citations(): string[] {
  const out = new Set<string>();
  const add = (c: { source?: string } | undefined) => {
    if (c?.source) out.add(c.source);
  };
  for (const f of LEDGER.fixtures) {
    add(f.date);
    add(f.host);
    add(f.result);
    add(f.listing);
  }
  return [...out];
}

/** The ledger's facts a snapshot shows, kind by kind. */
function factsOf(snapshot: Snapshot): Record<string, string[]> {
  const games = snapshot.games;
  const rejected = new Set(Object.keys(LEDGER_VIEW.rejected));
  const text = JSON.stringify(snapshot);
  return {
    dates: games.filter((g) => g.provenance.dateCorrection).map((g) => g.contestId),
    hosts: games.filter((g) => g.provenance.hostCorrection).map((g) => g.contestId),
    results: games.filter((g) => g.provenance.resultCorrection).map((g) => g.contestId),
    listed: games.filter((g) => g.contestId.startsWith('official:')).map((g) => g.contestId),
    // A ghost team's contest (lib/league-config/data-quality.ts, not the ledger) is dropped as 'ghost-team' either way.
    rejected: snapshot.dropped.filter((d) => d.reason === 'excluded-by-config' && rejected.has(d.contestId)).map((d) => d.contestId),
    citations: citations().filter((c) => text.includes(c)),
  };
}

describe('a run whose editor reads an empty ledger publishes none of the ledger’s facts', () => {
  it.each<CorpusName>(['all-2026-10-02', 'socal-2026-10-06'])('%s', async (corpus) => {
    const real = factsOf((await snapshotOf({ corpus, fetchedAt: LATE, steps: STEPS })).snapshot);
    for (const kind of ['results', 'listed', 'rejected', 'citations']) expect(real[kind].length, `${corpus}: the real ledger's ${kind}`).toBeGreaterThan(0);

    const empty = factsOf((await snapshotOf({ corpus, fetchedAt: LATE, steps: STEPS, ledger: EMPTY_LEDGER })).snapshot);
    expect(empty).toEqual({ dates: [], hosts: [], results: [], listed: [], rejected: [], citations: [] });
  });

  it('the corpora show a corrected day too', async () => {
    const real = factsOf((await snapshotOf({ corpus: 'socal-2026-10-06', fetchedAt: LATE, steps: STEPS })).snapshot);
    expect(real.dates.length).toBeGreaterThan(0);
  });
});
