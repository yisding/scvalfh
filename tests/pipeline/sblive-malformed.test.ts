/**
 * One malformed si.com row never aborts a run (SPEC §7.5: si.com is "source stale" at worst): a game
 * webPath with whitespace, or a non-numeric game id, is dropped from the si.com rows with a warning and
 * the run still writes a schema-valid snapshot. Real official and si.com steps over the all-2026-10-02
 * corpus, with the defect written into a temp variant.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { parseSnapshot } from '../../lib/snapshot-schema';
import { stableStringify } from '../../lib/stable-json';
import { corpusDir } from '../helpers';
import { snapshotOf, writeTempVariant } from './support/run-corpus';

const STEPS = { official: stepOfficial, sblive: stepSblive };
const SBLIVE = path.join(corpusDir('all-2026-10-02'), 'sblive');
const read = (rel: string) => readFileSync(path.join(SBLIVE, rel), 'utf8');

describe('si.com: malformed rows are dropped, not fatal', () => {
  it('a webPath with whitespace: the row gets no URL and never reaches the snapshot', async () => {
    const good = 'games/6617121-saint-francis-vs-valley-christian&quot;';
    const scores = read('scores/2026-09-30.html');
    expect(scores).toContain(good);
    const variant = writeTempVariant({
      'sblive/scores/2026-09-30': { rel: 'scores.html', body: scores.split(good).join('games/6617121-saint-francis-vs-valley christian&quot;') },
    });
    const { snapshot } = await snapshotOf({ variants: [variant], steps: STEPS });
    expect(() => parseSnapshot(snapshot)).not.toThrow();
    expect(stableStringify(snapshot)).not.toMatch(/valley christian/);
  });

  it('a non-numeric game id: the row is dropped with a warning; the run completes', async () => {
    const good = '&quot;id&quot;:&quot;6541425&quot;';
    const files: Record<string, { rel: string; body: string }> = {};
    for (const team of ['greenfield', 'santa-catalina']) {
      const html = read(`team-games/${team}.html`);
      expect(html, team).toContain(good);
      files[`sblive/team-games/${team}`] = { rel: `${team}.html`, body: html.split(good).join('&quot;id&quot;:&quot;G6541425&quot;') };
    }
    const { snapshot, run } = await snapshotOf({ variants: [writeTempVariant(files)], steps: STEPS });
    expect(() => parseSnapshot(snapshot)).not.toThrow();
    expect(snapshot.games.some((g) => g.contestId.includes('G6541425'))).toBe(false);
    expect(run.result?.logLines.some((l) => /non-numeric game id "G6541425"/.test(l))).toBe(true);
  });
});
