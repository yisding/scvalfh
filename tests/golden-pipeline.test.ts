/**
 * SPEC §5.11 item 3: the SCVAL corpus through the whole new pipeline (the real cron script with the
 * real official and si.com steps) reproduces the goldens captured on `main` before any change.
 * `tests/golden/scval-corpus.json` holds the 2026-09-29 offline run's SCVAL rows, cross-check,
 * counted division games and the official-fixture stamps. The only SCVAL difference the spec allows
 * is a D2-backfilled score (a new input); the SCVAL corpus has no si.com pages, so there is none and
 * equality must be exact.
 *
 * Every assertion message names the module that produces the value, so a failure is routed to its
 * owner.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { divisionsOf } from '../lib/leagues';
import { buildCrossCheck, divisionGames } from '../lib/standings';
import { loadSnapshot } from '../lib/snapshot-schema';
import { stableStringify } from '../lib/stable-json';
import type { DivisionId, Snapshot, Standing } from '../lib/types';
import { REPO, corpusSnapshotPath } from './helpers';

interface GoldenCorpus {
  _meta: { fetchedAt: string; officialMatched: number; officialUnmatched: number };
  standings: Standing[];
  crossCheck: unknown[];
  divisionGames: Record<DivisionId, string[]>;
  officialStamps: Record<string, string>;
}

const golden = JSON.parse(
  readFileSync(path.join(REPO, 'tests', 'golden', 'scval-corpus.json'), 'utf8'),
) as GoldenCorpus;

const SCVAL = divisionsOf('scval').map((d) => d.id);
const isScval = (s: { division: DivisionId }) => SCVAL.includes(s.division);

let snapshot: Snapshot;

beforeAll(() => {
  snapshot = loadSnapshot(JSON.parse(readFileSync(corpusSnapshotPath('scval'), 'utf8')) as unknown);
});

describe('golden item 3: the SCVAL corpus through the pipeline', () => {
  it('runs at the golden stamp with the SCVAL feeds only', () => {
    expect(snapshot.fetchedAt, 'lib/pipeline/run.ts: fetchedAt defaults to the corpus stamp').toBe(golden._meta.fetchedAt);
    expect(
      snapshot.leagueHealth.find((h) => h.leagueId === 'scval')?.state,
      'lib/pipeline/steps/guards.ts: SCVAL state on its own corpus',
    ).toBe('fresh');
  });

  it('SCVAL Standing rows are byte-identical to the golden rows', () => {
    const rows = snapshot.standings.filter(isScval);
    expect(rows.map((r) => r.slug), 'lib/standings.ts computeStandings: SCVAL row order').toEqual(
      golden.standings.map((r) => r.slug),
    );
    expect(stableStringify(rows), 'lib/standings.ts computeStandings (via lib/pipeline/steps/standings.ts): SCVAL rows').toBe(
      stableStringify(golden.standings),
    );
  });

  it('the SCVAL cross-check rows equal the golden ones', () => {
    expect(snapshot.crossCheck, 'lib/standings.ts buildCrossCheck (via lib/pipeline/steps/standings.ts)').toEqual(golden.crossCheck);
    expect(buildCrossCheck(snapshot.standings.filter(isScval)), 'lib/standings.ts buildCrossCheck').toEqual(golden.crossCheck);
  });

  it('the counted division games are the golden contests', () => {
    for (const d of SCVAL) {
      expect(
        divisionGames(snapshot.games, d).map((g) => g.contestId).sort(),
        `lib/classify.ts classifyGames (via lib/pipeline/steps/classify.ts): ${d} division games`,
      ).toEqual([...golden.divisionGames[d]].sort());
    }
  });

  it('every SCVAL official stamp equals the golden stamp, and no other game is stamped', () => {
    const stamps: Record<string, string> = {};
    for (const g of snapshot.games) {
      if (g.official && SCVAL.includes(g.official.division)) stamps[g.contestId] = g.official.scheduledDate;
    }
    expect(Object.keys(stamps).length, 'lib/official/match.ts legacy matcher: SCVAL stamps').toBe(golden._meta.officialMatched);
    expect(stamps, 'lib/official/match.ts legacy matcher: SCVAL official.scheduledDate per contest').toEqual(golden.officialStamps);
    expect(
      (snapshot.officialFixtures ?? []).filter((f) => SCVAL.includes(f.division)).length,
      'lib/pipeline/steps/official.ts: SCVAL unmatched fixtures',
    ).toBe(golden._meta.officialUnmatched);
  });

  it('publishes no si.com score for SCVAL (the golden inputs contain none)', () => {
    expect(
      snapshot.games.filter((g) => g.provenance.scores === 'sblive').map((g) => g.contestId),
      'lib/backfill.ts: SCVAL fills on the SCVAL corpus',
    ).toEqual([]);
  });
});
