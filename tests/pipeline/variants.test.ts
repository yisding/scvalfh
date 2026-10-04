/**
 * The variant overlays under tests/fixtures/corpus/variants/ (SPEC §7.3): each loads on top of the
 * all-2026-10-02 corpus and carries exactly the defect it is named for. (Their end-to-end effects
 * through the real official/si.com steps are Stage B-int cases.)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEAGUE_IDS, divisionsOf } from '../../lib/leagues';
import { officialDocumentOf } from '../../lib/official/schema';
import { TransportError } from '../../lib/pipeline/contract';
import { loadCorpus } from '../../lib/pipeline/corpus';
import { FixtureTransport } from '../../lib/pipeline/transport';
import { SPORT_SEASON_ID } from '../../lib/season';
import { loadSnapshot } from '../../lib/snapshot-schema';
import { ScheduleResponseSchema } from '../../lib/sources/maxpreps';
import { corpusDir, variantDir } from '../helpers';
import {
  FINALS_REGRESSION_DIR,
  FINALS_REGRESSION_PREVIOUS_AT,
  REGRESSED_FINALS,
  writeFinalsRegressionVariant,
} from './support/finals-regression';
import { snapshotOf } from './support/run-corpus';

const ALL = corpusDir('all-2026-10-02');
const transportFor = (variant: string) => new FixtureTransport(loadCorpus(ALL, [variantDir(variant)]));

describe('variants', () => {
  it.runIf(process.env.B1_REBUILD_VARIANTS === '1')('rebuilds finals-regression/previous-snapshot.json', async () => {
    // B-int: built with the real official (B2) and si.com (B3) steps. The committed file is frozen as a
    // four-league v2 snapshot (written before the EAL was added): it exercises loadSnapshot's
    // league-added upgrade, so it is not rebuilt for later config changes.
    const { stepOfficial } = await import('../../lib/pipeline/steps/official');
    const { stepSblive } = await import('../../lib/pipeline/steps/sblive');
    await writeFinalsRegressionVariant(stepOfficial, stepSblive);
  });

  it('pcal-standings-empty: PCAL standings answer 200 with zero rows', async () => {
    const res = await transportFor('pcal-standings-empty').get({ kind: 'maxpreps-standings', division: 'pcal' });
    expect(JSON.parse(res.body)).toMatchObject({ status: 200, data: [] });
  });

  it('bval-meta-wrong-season: the Santa Teresa meta carries the 2025-26 season', async () => {
    const res = await transportFor('bval-meta-wrong-season').get({ kind: 'maxpreps-league-meta', division: 'santa-teresa' });
    const meta = (JSON.parse(res.body) as { data: { sportSeasonId: string; year: string } }).data;
    expect(meta.sportSeasonId).not.toBe(SPORT_SEASON_ID);
    expect(meta.year).toBe('25-26');
    // The other BVAL division is untouched.
    const mh = await transportFor('bval-meta-wrong-season').get({ kind: 'maxpreps-league-meta', division: 'mt-hamilton' });
    expect((JSON.parse(mh.body) as { data: { sportSeasonId: string } }).data.sportSeasonId).toBe(SPORT_SEASON_ID);
  });

  it('leland-feed-503: the Leland feed is an HTTP 503', async () => {
    const t = transportFor('leland-feed-503');
    await expect(t.get({ kind: 'maxpreps-schedule', team: 'leland' })).rejects.toBeInstanceOf(TransportError);
    await expect(t.get({ kind: 'maxpreps-schedule', team: 'leland' })).rejects.toMatchObject({ httpStatus: 503 });
    await expect(t.get({ kind: 'maxpreps-schedule', team: 'leigh' })).resolves.toMatchObject({ httpStatus: 200 });
  });

  it('bval-revised: the Mt. Hamilton revision hash differs from the bundled copy, Santa Teresa does not', async () => {
    const t = transportFor('bval-revised');
    const mh = await t.get({ kind: 'official-revision', division: 'mt-hamilton' });
    const st = await t.get({ kind: 'official-revision', division: 'santa-teresa' });
    expect(mh.body).toMatch(/^[0-9a-f]{64}$/);
    expect(mh.body).not.toBe(officialDocumentOf('mt-hamilton').bundledSha256);
    expect(st.body).toBe(officialDocumentOf('santa-teresa').bundledSha256);
  });

  it('mcal-postseason: four synthetic finals Oct 24-30 (contestType 0 and 4) and the Oct 22 league game moved to Oct 23', async () => {
    const t = transportFor('mcal-postseason');
    const contests = new Map<string, { date: string; types: Array<number | null>; state: number }>();
    for (const slug of ['marin-catholic', 'lick-wilmerding', 'redwood', 'tamalpais', 'university-sf']) {
      const res = await t.get({ kind: 'maxpreps-schedule', team: slug });
      for (const row of ScheduleResponseSchema.parse(JSON.parse(res.body)).data) {
        contests.set(row.contest.contestId, {
          date: row.contest.date.slice(0, 10),
          types: row.contest.teams.map((x) => x.contestType),
          state: row.calculatedFields.contestState,
        });
      }
    }
    const late = [...contests.values()].filter((c) => c.date >= '2026-10-24' && c.date <= '2026-10-30');
    expect(late.length).toBe(4);
    expect(late.every((c) => c.state === 4)).toBe(true);
    expect(new Set(late.flatMap((c) => c.types))).toEqual(new Set([0, 4]));
    expect(contests.get('dad1ea0d-8dd3-4c55-ba33-368d449b9de6')?.date).toBe('2026-10-23');
  });

  it('finals-regression: ships a loadable previous snapshot with three more Santa Teresa finals', () => {
    const corpus = loadCorpus(ALL, [variantDir('finals-regression')]);
    expect(corpus.previous).toBe(path.join(FINALS_REGRESSION_DIR, 'previous-snapshot.json'));
    const previous = loadSnapshot(JSON.parse(readFileSync(corpus.previous as string, 'utf8')) as unknown);
    expect(previous.fetchedAt).toBe(FINALS_REGRESSION_PREVIOUS_AT);
    for (const id of Object.keys(REGRESSED_FINALS)) {
      const g = previous.games.find((x) => x.contestId === id);
      expect(g?.status, id).toBe('final');
      expect(g?.countsFor, id).toBe('santa-teresa');
    }
    // A four-league file: the league-added upgrade fills in the EAL as degraded, with nothing to carry.
    expect(previous.season.leagues.map((l) => l.id)).toEqual(LEAGUE_IDS);
    expect(previous.leagueHealth.find((h) => h.leagueId === 'eal')).toMatchObject({ state: 'degraded', lastFreshAt: null });
    const bval = previous.leagueHealth.find((h) => h.leagueId === 'bval');
    expect(bval?.state).toBe('fresh');
    expect(bval?.divisions.map((d) => d.divisionId)).toEqual(divisionsOf('bval').map((d) => d.id));
    expect(bval?.divisions.find((d) => d.divisionId === 'santa-teresa')?.countedFinals).toBeGreaterThanOrEqual(3);
  });

  it('mcal-postseason runs through the pipeline: every late MCAL contest is tournament play and counts for nothing', async () => {
    const { snapshot } = await snapshotOf({ variants: ['mcal-postseason'] });
    const late = snapshot.games.filter((g) => g.contestId.startsWith('f0c0ffee-') || g.contestId.startsWith('dad1ea0d'));
    expect(late.length).toBe(5);
    for (const g of late) {
      expect(g.postseason?.kind, g.contestId).toBe('mcal-tournament');
      expect(g.countsFor, g.contestId).toBeNull();
    }
    expect(late.find((g) => g.contestId.startsWith('dad1ea0d'))?.postseason?.via).toBe('league-postseason-window');
    expect(late.filter((g) => g.postseason?.via === 'contest-type-4').length).toBe(2);
  });
});
